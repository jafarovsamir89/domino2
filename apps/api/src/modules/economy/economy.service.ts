import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";

import { Prisma, type CoinLedgerType } from "@prisma/client";

import { AuthService } from "../auth/auth.service.js";
import { verifyGameToken } from "../auth/game-token.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { calculatePlayerRating } from "../ranking/player-ranking.js";

type EconomyTx = PrismaService | Prisma.TransactionClient;

type StakeParticipant = {
  playerId?: string;
  userId?: string;
  displayName?: string;
};

type ReservePayload = {
  roomId?: string | null;
  roomCode?: string | null;
  matchId?: string | null;
  stakeKey?: string | null;
  participants?: StakeParticipant[];
};

type SettlePayload = ReservePayload & {
  result?: "win" | "draw" | "refund" | string | null;
  winnerPlayerIds?: string[];
  winnerUserIds?: string[];
};

type EconomyGrantPayload = {
  amount?: number;
  reason?: string;
  note?: string | null;
  idempotencyKey?: string | null;
};

type EconomyStakeTablePayload = {
  id?: string;
  key: string;
  title: string;
  stakeAmount: number;
  commissionBps: number;
  isFree?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

type EconomyConfigPayload = {
  matchCommissionBps?: number;
  dailyBaseAmount?: number;
  dailyStreakBonus?: number;
  dailyMaxStreak?: number;
  dailyClaimCooldown?: number;
  tournamentCommissionBps?: number;
  adRewardAmount?: number;
};

type EconomyQuestPayload = {
  id?: string;
  key: string;
  title: string;
  description?: string | null;
  rewardAmount: number;
  maxProgress?: number;
  period?: string;
  isActive?: boolean;
};

type EconomyTournamentPayload = {
  id?: string;
  key: string;
  title: string;
  description?: string | null;
  entryFee: number;
  prizePool: number;
  commissionBps: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
};

const DEFAULT_CONFIG_KEY = "default";
const COIN_SHOP_VIDEO_REWARD_AMOUNT = 25;
const COIN_SHOP_VIDEO_COOLDOWN_MINUTES = 30;
const COIN_SHOP_VIDEO_DAILY_LIMIT = 6;

const DEFAULT_STAKES: EconomyStakeTablePayload[] = [
  { key: "free", title: "Free table", stakeAmount: 0, commissionBps: 0, isFree: true, isActive: false, sortOrder: 0 },
  { key: "stake_50", title: "50 coins", stakeAmount: 50, commissionBps: 500, isFree: false, isActive: true, sortOrder: 1 },
  { key: "stake_100", title: "100 coins", stakeAmount: 100, commissionBps: 500, isFree: false, isActive: true, sortOrder: 2 },
  { key: "stake_200", title: "200 coins", stakeAmount: 200, commissionBps: 500, isFree: false, isActive: true, sortOrder: 3 },
  { key: "stake_500", title: "500 coins", stakeAmount: 500, commissionBps: 500, isFree: false, isActive: true, sortOrder: 4 },
  { key: "stake_1000", title: "1,000 coins", stakeAmount: 1000, commissionBps: 500, isFree: false, isActive: true, sortOrder: 5 },
  { key: "stake_5000", title: "5,000 coins", stakeAmount: 5000, commissionBps: 500, isFree: false, isActive: true, sortOrder: 6 }
];

const DEFAULT_TABLE_SKINS = [
  {
    key: "table_skin_01",
    name: "Aurora Felt",
    description: "Blue-green premium felt with a warm gold edge.",
    sortOrder: 1
  },
  {
    key: "table_skin_02",
    name: "Midnight Carbon",
    description: "Dark carbon weave with a subtle studio shine.",
    sortOrder: 2
  },
  {
    key: "table_skin_03",
    name: "Emerald Classic",
    description: "Rich green felt with clean tournament contrast.",
    sortOrder: 3
  },
  {
    key: "table_skin_04",
    name: "Ocean Drift",
    description: "Deep blue surface with soft motion lines.",
    sortOrder: 4
  },
  {
    key: "table_skin_05",
    name: "Walnut Table",
    description: "Warm wood grain for a premium club feel.",
    sortOrder: 5
  },
  {
    key: "table_skin_06",
    name: "Ivory Marble",
    description: "Light marble with elegant veins and depth.",
    sortOrder: 6
  }
] as const;
const DEFAULT_TABLE_SKIN_KEY = "table_skin_default";

const SOLO_MAX_STAKE = 200;

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function toUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function calcCommission(amount: number, bps: number) {
  return Math.max(0, Math.floor((amount * Math.max(0, bps)) / 10000));
}

function formatStakeSummary(stake: { key: string; title: string; stakeAmount: number; commissionBps: number; isFree: boolean; isActive: boolean; sortOrder: number }) {
  return {
    ...stake,
    bankExample: Math.max(0, stake.stakeAmount * 2),
    commissionExample: calcCommission(Math.max(0, stake.stakeAmount * 2), stake.commissionBps),
    payoutExample: Math.max(0, stake.stakeAmount * 2) - calcCommission(Math.max(0, stake.stakeAmount * 2), stake.commissionBps)
  };
}

function isTableSkinProductKey(productKey: string) {
  return String(productKey || "").startsWith("table_skin_");
}

function getTableSkinAssetUrl(productKey: string) {
  return `/assets/cosmetics/table/${productKey}.png`;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class EconomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  private async requireAdmin(headers: IncomingHttpHeaders) {
    const session = await this.authService.getSession(headers);
    const role = String(session?.user?.role || "player");
    if (!session?.user) {
      throw new UnauthorizedException("Admin session required");
    }
    if (role !== "admin" && role !== "superadmin") {
      throw new ForbiddenException("Admin role required");
    }
    return session;
  }

  private async recordAdminAction(
    db: EconomyTx,
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    payloadJson?: Prisma.InputJsonValue
  ) {
    await db.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        entityType,
        entityId,
        payloadJson
      }
    });
  }

  private async ensureBootstrap(db: EconomyTx = this.prisma) {
    await db.coinEconomyConfig.upsert({
      where: { key: DEFAULT_CONFIG_KEY },
      update: {},
      create: {
        key: DEFAULT_CONFIG_KEY
      }
    });

    for (const stake of DEFAULT_STAKES) {
      await db.coinStakeTable.upsert({
        where: { key: stake.key },
        update: {
          title: stake.title,
          stakeAmount: stake.stakeAmount,
          commissionBps: stake.commissionBps,
          isFree: stake.isFree,
          isActive: stake.isActive,
          sortOrder: stake.sortOrder
        },
        create: stake
      });
    }

    for (const skin of DEFAULT_TABLE_SKINS) {
      const product = await db.catalogProduct.upsert({
        where: { key: skin.key },
        update: {
          name: skin.name,
          description: skin.description,
          isActive: true
        },
        create: {
          key: skin.key,
          name: skin.name,
          description: skin.description,
          isActive: true
        }
      });

      const price = await db.catalogPrice.findFirst({
        where: {
          productId: product.id,
          currency: "COIN"
        }
      });

      if (price) {
        await db.catalogPrice.update({
          where: { id: price.id },
          data: {
            amountMinor: 200,
            isActive: true
          }
        });
      } else {
        await db.catalogPrice.create({
          data: {
            productId: product.id,
            currency: "COIN",
            amountMinor: 200,
            isActive: true
          }
        });
      }
    }
  }

  private async ensureWallet(db: EconomyTx, playerId: string) {
    return db.coinWallet.upsert({
      where: { playerId },
      update: {},
      create: {
        playerId
      }
    });
  }

  private async getLockedWallet(db: EconomyTx, playerId: string) {
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

  private async findOrCreatePlayerByIdentity(
    db: EconomyTx,
    participant: StakeParticipant,
    fallbackName = "Player"
  ) {
    const playerId = toCleanString(participant.playerId);
    const userId = toCleanString(participant.userId);
    const displayName = toCleanString(participant.displayName, fallbackName).slice(0, 24) || fallbackName;

    if (playerId) {
      const player = await db.player.findUnique({
        where: { id: playerId },
        include: {
          wallet: true
        }
      });
      if (player) return player;
    }

    if (userId) {
      return db.player.upsert({
        where: { userId },
        update: {
          displayName
        },
        create: {
          userId,
          displayName,
          isGuest: false
        },
        include: {
          wallet: true
        }
      });
    }

    throw new BadRequestException("Player identity is required");
  }

  private async creditWallet(
    db: EconomyTx,
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
        balance: {
          increment: nextAmount
        },
        lifetimeEarned: {
          increment: nextAmount
        }
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

  private async debitWallet(
    db: EconomyTx,
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
        balance: {
          decrement: nextAmount
        },
        lifetimeSpent: {
          increment: nextAmount
        }
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

  private async reserveWallet(
    db: EconomyTx,
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
        balance: {
          decrement: nextAmount
        },
        reserved: {
          increment: nextAmount
        }
      }
    });

    await db.coinLedgerEntry.create({
      data: {
        playerId,
        type: "reserve",
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

  private async releaseWallet(
    db: EconomyTx,
    playerId: string,
    amount: number,
    type: Exclude<CoinLedgerType, "spend" | "reserve">,
    referenceType: string,
    referenceId: string,
    extras: { idempotencyKey?: string | null; note?: string | null; payloadJson?: Prisma.InputJsonValue; createdByUserId?: string | null } = {}
  ) {
    const nextAmount = Math.max(0, Math.trunc(amount));
    if (!nextAmount) {
      return this.ensureWallet(db, playerId);
    }

    const wallet = await this.getLockedWallet(db, playerId);
    if (wallet.reserved < nextAmount) {
      throw new BadRequestException("Reserved balance is too small");
    }

    const updated = await db.coinWallet.update({
      where: { playerId },
      data: {
        balance: {
          increment: nextAmount
        },
        reserved: {
          decrement: nextAmount
        }
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

  private async consumeReservedWallet(
    db: EconomyTx,
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
    if (wallet.reserved < nextAmount) {
      throw new BadRequestException("Reserved balance is too small");
    }

    const updated = await db.coinWallet.update({
      where: { playerId },
      data: {
        reserved: {
          decrement: nextAmount
        },
        lifetimeSpent: {
          increment: nextAmount
        }
      }
    });

    await db.coinLedgerEntry.create({
      data: {
        playerId,
        type: "spend",
        amount: 0,
        balanceBefore: wallet.balance,
        balanceAfter: updated.balance,
        reservedBefore: wallet.reserved,
        reservedAfter: updated.reserved,
        referenceType,
        referenceId,
        idempotencyKey: extras.idempotencyKey ?? undefined,
        note: extras.note ?? undefined,
        payloadJson: {
          ...(extras.payloadJson as Record<string, unknown> | undefined),
          consumedAmount: nextAmount
        } as Prisma.InputJsonValue,
        createdByUserId: extras.createdByUserId ?? undefined
      }
    });

    return updated;
  }

  private async getConfig(db: EconomyTx = this.prisma) {
    await this.ensureBootstrap(db);
    return db.coinEconomyConfig.findUnique({
      where: { key: DEFAULT_CONFIG_KEY }
    });
  }

  async getPublicConfig() {
    await this.ensureBootstrap();
    const [config, stakes] = await Promise.all([
      this.getConfig(),
      this.prisma.coinStakeTable.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }]
      })
    ]);

    return {
      config,
      stakes: stakes.filter((stake) => !stake.isFree).map(formatStakeSummary),
      coinShop: this.buildCoinShopConfig(config)
    };
  }

  private buildCoinShopConfig(config: { adRewardAmount?: number | null; dailyClaimCooldown?: number | null } | null) {
    const rewardAmount = Math.max(COIN_SHOP_VIDEO_REWARD_AMOUNT, Number(config?.adRewardAmount || 0) || COIN_SHOP_VIDEO_REWARD_AMOUNT);
    const cooldownMinutes = Math.max(COIN_SHOP_VIDEO_COOLDOWN_MINUTES, Number(config?.dailyClaimCooldown || 0) || COIN_SHOP_VIDEO_COOLDOWN_MINUTES);
    return {
      videoReward: {
        amount: rewardAmount,
        cooldownMinutes,
        dailyLimit: COIN_SHOP_VIDEO_DAILY_LIMIT
      },
      packs: [
        { key: "coin_pack_100", coins: 100, priceLabel: "0.99 AZN", bonusCoins: 0, isRecommended: false },
        { key: "coin_pack_250", coins: 250, priceLabel: "1.99 AZN", bonusCoins: 25, isRecommended: true },
        { key: "coin_pack_600", coins: 600, priceLabel: "4.99 AZN", bonusCoins: 75, isRecommended: false },
        { key: "coin_pack_1500", coins: 1500, priceLabel: "9.99 AZN", bonusCoins: 250, isRecommended: false },
        { key: "coin_pack_3500", coins: 3500, priceLabel: "19.99 AZN", bonusCoins: 700, isRecommended: false }
      ]
    };
  }

  async getCoinShopStatus(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    await this.ensureBootstrap();
    const config = await this.getConfig();
    const wallet = await this.ensureWallet(this.prisma, profile.player.id);
    const shop = this.buildCoinShopConfig(config);
    const lastReward = await this.prisma.coinLedgerEntry.findFirst({
      where: {
        playerId: profile.player.id,
        type: "ad_reward"
      },
      orderBy: { createdAt: "desc" }
    });
    const claimsToday = await this.prisma.coinLedgerEntry.count({
      where: {
        playerId: profile.player.id,
        type: "ad_reward",
        createdAt: {
          gte: startOfUtcDay(new Date())
        }
      }
    });
    const nextAvailableAt = lastReward
      ? new Date(lastReward.createdAt.getTime() + shop.videoReward.cooldownMinutes * 60_000)
      : null;
    const canClaim = claimsToday < shop.videoReward.dailyLimit && (!nextAvailableAt || nextAvailableAt.getTime() <= Date.now());

    return {
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        spendableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      coinShop: {
        ...shop,
        claimsToday,
        nextAvailableAt: nextAvailableAt ? nextAvailableAt.toISOString() : null,
        canClaim,
        remainingSeconds: nextAvailableAt ? Math.max(0, Math.ceil((nextAvailableAt.getTime() - Date.now()) / 1000)) : 0
      }
    };
  }

  async claimCoinShopVideoReward(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    await this.ensureBootstrap();
    const config = await this.getConfig();
    const shop = this.buildCoinShopConfig(config);
    const now = new Date();
    const lastReward = await this.prisma.coinLedgerEntry.findFirst({
      where: {
        playerId: profile.player.id,
        type: "ad_reward"
      },
      orderBy: { createdAt: "desc" }
    });
    const claimsToday = await this.prisma.coinLedgerEntry.count({
      where: {
        playerId: profile.player.id,
        type: "ad_reward",
        createdAt: {
          gte: startOfUtcDay(now)
        }
      }
    });

    if (claimsToday >= shop.videoReward.dailyLimit) {
      throw new BadRequestException("Daily video reward limit reached");
    }

    if (lastReward) {
      const nextAvailableAt = lastReward.createdAt.getTime() + shop.videoReward.cooldownMinutes * 60_000;
      if (nextAvailableAt > now.getTime()) {
        const remainingSeconds = Math.ceil((nextAvailableAt - now.getTime()) / 1000);
        throw new BadRequestException(`Video reward available in ${Math.max(1, Math.ceil(remainingSeconds / 60))} min`);
      }
    }

    const idempotencyKey = `coin-shop-video:${profile.player.id}:${toUtcDateKey(now)}:${claimsToday + 1}`;
    const wallet = await this.creditWallet(
      this.prisma,
      profile.player.id,
      shop.videoReward.amount,
      "ad_reward",
      "coin_shop",
      idempotencyKey,
      {
        note: "Reward video",
        payloadJson: {
          rewardAmount: shop.videoReward.amount,
          cooldownMinutes: shop.videoReward.cooldownMinutes,
          dailyLimit: shop.videoReward.dailyLimit,
          claimsToday: claimsToday + 1
        }
      }
    );

    const nextAvailableAt = new Date(now.getTime() + shop.videoReward.cooldownMinutes * 60_000);
    return {
      ok: true,
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        spendableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      rewardAmount: shop.videoReward.amount,
      cooldownMinutes: shop.videoReward.cooldownMinutes,
      dailyLimit: shop.videoReward.dailyLimit,
      claimsToday: claimsToday + 1,
      nextAvailableAt: nextAvailableAt.toISOString()
    };
  }

  async getWallet(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      return null;
    }

    const [wallet, ledger, stakes] = await Promise.all([
      this.ensureWallet(this.prisma, profile.player.id),
      this.prisma.coinLedgerEntry.findMany({
        where: { playerId: profile.player.id },
        orderBy: { createdAt: "desc" },
        take: 25
      }),
      this.prisma.coinMatchStake.findMany({
        where: { playerId: profile.player.id },
        include: { stakeTable: true },
        orderBy: { reservedAt: "desc" },
        take: 10
      })
    ]);

    return {
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        spendableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      ledger,
      stakes
    };
  }

  async getAdminOverview(headers: IncomingHttpHeaders) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const [walletCount, balanceAgg, reservedAgg, ledgerCount, stakeCount] = await Promise.all([
      this.prisma.coinWallet.count(),
      this.prisma.coinWallet.aggregate({ _sum: { balance: true } }),
      this.prisma.coinWallet.aggregate({ _sum: { reserved: true } }),
      this.prisma.coinLedgerEntry.count(),
      this.prisma.coinStakeTable.count({ where: { isActive: true } })
    ]);

    return {
      phase: "economy-online",
      metrics: {
        wallets: walletCount,
        coinsInCirculation: balanceAgg._sum.balance || 0,
        coinsReserved: reservedAgg._sum.reserved || 0,
        ledgerEntries: ledgerCount,
        activeStakeTables: stakeCount
      },
      config: await this.getConfig()
    };
  }

  async listAdminWallets(headers: IncomingHttpHeaders, query?: string, limit?: string, offset?: string) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const take = Math.max(1, Math.min(100, toInt(limit, 25)));
    const skip = Math.max(0, toInt(offset, 0));
    const nextQuery = toCleanString(query).toLowerCase();

    const wallets = await this.prisma.coinWallet.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        player: {
          include: {
            user: true,
            stats: true
          }
        }
      }
    });

    const items = wallets
      .filter((wallet) => {
        if (!nextQuery) return true;
        const searchable = [
          wallet.player.displayName,
          wallet.player.user?.email || "",
          wallet.player.user?.name || "",
          wallet.player.id
        ].join(" ").toLowerCase();
        return searchable.includes(nextQuery);
      })
      .map((wallet) => ({
        id: wallet.id,
        playerId: wallet.playerId,
        displayName: wallet.player.displayName,
        email: wallet.player.user?.email || null,
        isGuest: wallet.player.isGuest,
        balance: wallet.balance,
        reserved: wallet.reserved,
        lifetimeEarned: wallet.lifetimeEarned,
        lifetimeSpent: wallet.lifetimeSpent,
        rating: wallet.player.stats ? calculatePlayerRating(wallet.player.stats) : 1000,
        updatedAt: wallet.updatedAt
      }));

    return {
      items: items.slice(skip, skip + take),
      pagination: {
        limit: take,
        offset: skip,
        hasMore: items.length > skip + take
      }
    };
  }

  async getAdminWallet(headers: IncomingHttpHeaders, playerId: string) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        user: true,
        stats: true,
        wallet: true,
        dailyClaims: {
          orderBy: { createdAt: "desc" },
          take: 20
        },
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          take: 50
        },
        matchStakes: {
          include: { stakeTable: true },
          orderBy: { reservedAt: "desc" },
          take: 20
        },
        tournamentEntries: {
          include: { tournament: true },
          orderBy: { joinedAt: "desc" },
          take: 10
        }
      }
    });

    if (!player) {
      return null;
    }

    const wallet = player.wallet || (await this.ensureWallet(this.prisma, player.id));
    return {
      player: {
        id: player.id,
        displayName: player.displayName,
        avatarSeed: player.avatarSeed,
        isGuest: player.isGuest,
        language: player.language,
        user: player.user
          ? {
              id: player.user.id,
              email: player.user.email,
              role: player.user.role || "player",
              emailVerified: player.user.emailVerified,
              image: player.user.image
            }
          : null,
        stats: player.stats
      },
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      ledgerEntries: player.ledgerEntries,
      dailyClaims: player.dailyClaims,
      stakes: player.matchStakes,
      tournaments: player.tournamentEntries
    };
  }

  async listPublicStakes() {
    await this.ensureBootstrap();
    const stakes = await this.prisma.coinStakeTable.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }]
    });
    return stakes.map(formatStakeSummary);
  }

  async listPublicQuests(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    await this.ensureBootstrap();

    const quests = await this.prisma.coinQuest.findMany({
      where: { isActive: true },
      orderBy: [{ rewardAmount: "desc" }, { title: "asc" }]
    });

    if (!profile?.player) {
      return quests.map((quest) => ({
        ...quest,
        progress: 0,
        state: "locked",
        claimedAt: null,
        completedAt: null
      }));
    }

    const progress = await this.prisma.coinQuestProgress.findMany({
      where: { playerId: profile.player.id },
      include: { quest: true }
    });
    const progressByQuestId = new Map(progress.map((entry) => [entry.questId, entry]));

    return quests.map((quest) => {
      const current = progressByQuestId.get(quest.id);
      return {
        ...quest,
        progress: current?.progress ?? 0,
        state: current?.state ?? "active",
        claimedAt: current?.claimedAt ?? null,
        completedAt: current?.completedAt ?? null
      };
    });
  }

  async claimDailyBonus(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    const config = await this.getConfig();
    if (!config) {
      throw new BadRequestException("Economy config missing");
    }

    const now = new Date();
    const claimDate = toUtcDateKey(now);
    const prevDay = new Date(now);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const previousDateKey = toUtcDateKey(prevDay);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.coinDailyBonusClaim.findUnique({
        where: {
          playerId_claimDate: {
            playerId: profile.player.id,
            claimDate
          }
        }
      });
      if (existing) {
        return {
          claimed: false,
          claim: existing,
          wallet: await this.ensureWallet(tx, profile.player.id)
        };
      }

      const previousClaim = await tx.coinDailyBonusClaim.findFirst({
        where: {
          playerId: profile.player.id,
          claimDate: previousDateKey
        },
        orderBy: {
          createdAt: "desc"
        }
      });
      const streakDay = previousClaim ? Math.min(config.dailyMaxStreak, previousClaim.streakDay + 1) : 1;
      const amount = config.dailyBaseAmount + Math.max(0, streakDay - 1) * config.dailyStreakBonus;

      const wallet = await this.creditWallet(
        tx,
        profile.player.id,
        amount,
        "daily_bonus",
        "daily_bonus",
        claimDate,
        {
          note: `Daily claim for ${claimDate}`,
          payloadJson: {
            streakDay,
            claimDate
          }
        }
      );

      const claim = await tx.coinDailyBonusClaim.create({
        data: {
          playerId: profile.player.id,
          claimDate,
          streakDay,
          amount
        }
      });

      await this.advanceQuestProgressInternal(tx, profile.player.id, "daily_login", 1, {
        source: "daily_bonus",
        referenceId: claim.id
      });

      return {
        claimed: true,
        claim,
        wallet
      };
    });
  }

  async advanceQuest(headers: IncomingHttpHeaders, questKey: string, amount = 1) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await this.advanceQuestProgressInternal(tx, profile.player.id, questKey, amount, {
        source: "manual"
      });
      return result;
    });
  }

  async claimQuestReward(headers: IncomingHttpHeaders, questKey: string) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    await this.ensureBootstrap();

    return this.prisma.$transaction(async (tx) => {
      const quest = await tx.coinQuest.findUnique({
        where: { key: questKey }
      });
      if (!quest || !quest.isActive) {
        throw new BadRequestException("Quest not found");
      }

      const progress = await tx.coinQuestProgress.findUnique({
        where: {
          playerId_questId: {
            playerId: profile.player.id,
            questId: quest.id
          }
        }
      });

      if (!progress || progress.progress < quest.maxProgress) {
        throw new BadRequestException("Quest not completed");
      }

      if (progress.claimedAt) {
        return {
          claimed: false,
          quest,
          progress
        };
      }

      const updatedProgress = await tx.coinQuestProgress.update({
        where: {
          playerId_questId: {
            playerId: profile.player.id,
            questId: quest.id
          }
        },
        data: {
          claimedAt: new Date(),
          state: "claimed"
        }
      });

      const wallet = await this.creditWallet(
        tx,
        profile.player.id,
        quest.rewardAmount,
        "quest_reward",
        "quest",
        quest.key,
        {
          note: quest.title,
          payloadJson: {
            questKey: quest.key,
            progressId: updatedProgress.id
          }
        }
      );

      return {
        claimed: true,
        quest,
        progress: updatedProgress,
        wallet
      };
    });
  }

  async purchaseCosmetic(headers: IncomingHttpHeaders, productKey: string, quantity = 1) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    const nextQuantity = Math.max(1, Math.min(99, Math.trunc(quantity) || 1));
    await this.ensureBootstrap();
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.catalogProduct.findUnique({
        where: { key: productKey },
        include: {
          prices: {
            where: { isActive: true },
            orderBy: { amountMinor: "asc" }
          }
        }
      });
      if (!product || !product.isActive) {
        throw new BadRequestException("Product not found");
      }

      const price = product.prices.find((entry) => String(entry.currency || "").toUpperCase() === "COIN");
      if (!price) {
        throw new BadRequestException("Coin price missing");
      }

      const wallet = await this.ensureWallet(tx, profile.player.id);

      const tableSkin = isTableSkinProductKey(product.key);
      if (tableSkin) {
        const existingEntitlement = await tx.playerEntitlement.findUnique({
          where: {
            playerId_productKey: {
              playerId: profile.player.id,
              productKey: product.key
            }
          }
        });

        if (existingEntitlement && Number(existingEntitlement.quantity || 0) > 0) {
          return {
            entitlement: existingEntitlement,
            product,
            price,
            totalCost: 0,
            wallet,
            alreadyOwned: true
          };
        }
      }

      const totalCost = price.amountMinor * nextQuantity;
      const updatedWallet = await this.debitWallet(
        tx,
        profile.player.id,
        totalCost,
        "shop_purchase",
        "catalog_product",
        product.key,
        {
          note: product.name,
          payloadJson: {
            productKey: product.key,
            priceId: price.id,
            quantity: nextQuantity
          }
        }
      );

      const entitlement = await tx.playerEntitlement.upsert({
        where: {
          playerId_productKey: {
            playerId: profile.player.id,
            productKey: product.key
          }
        },
        update: {
          quantity: tableSkin
            ? 1
            : {
                increment: nextQuantity
              }
        },
        create: {
          playerId: profile.player.id,
          productKey: product.key,
          quantity: tableSkin ? 1 : nextQuantity
        }
      });

      return {
        entitlement,
        product,
        price,
        totalCost,
        wallet: updatedWallet
      };
    });
  }

  async reserveMatchStake(token: string, payload: ReservePayload = {}) {
    const claims = verifyGameToken(token);
    if (!claims) {
      return {
        ok: false,
        reason: "invalid_token"
      };
    }

    await this.ensureBootstrap();
    const roomId = toCleanString(payload.roomId);
    const matchId = toCleanString(payload.matchId);
    const stakeKey = toCleanString(payload.stakeKey, "free") || "free";
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    if (!roomId) {
      return {
        ok: false,
        reason: "missing_room"
      };
    }
    if (!participants.length) {
      return {
        ok: false,
        reason: "missing_participants"
      };
    }

    const stakeTable = await this.prisma.coinStakeTable.findUnique({
      where: { key: stakeKey }
    });

    if (!stakeTable || !stakeTable.isActive || stakeTable.stakeAmount <= 0) {
      return {
        ok: true,
        reserved: 0,
        stakeKey,
        commissionBps: 0
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const resolved = [];
        for (const participant of participants) {
          const player = await this.findOrCreatePlayerByIdentity(tx, participant, claims.displayName);
          const wallet = await this.ensureWallet(tx, player.id);
          if (wallet.balance < stakeTable.stakeAmount) {
            throw new BadRequestException(`Insufficient coins for ${player.displayName}`);
          }
          resolved.push({ player, wallet });
        }

        for (const { player, wallet } of resolved) {
          const existing = await tx.coinMatchStake.findUnique({
            where: {
              roomId_playerId_stakeTableId: {
                roomId,
                playerId: player.id,
                stakeTableId: stakeTable.id
              }
            }
          });
          if (existing && existing.status === "reserved") {
            continue;
          }

          await this.reserveWallet(
            tx,
            player.id,
            stakeTable.stakeAmount,
            "match_reserve",
            roomId,
            {
              idempotencyKey: `${roomId}:${matchId || "match"}:${player.id}:${stakeTable.id}:reserve`,
              note: stakeTable.title,
              payloadJson: {
                stakeKey,
                roomId,
                roomCode: payload.roomCode ?? null,
                playerId: player.id,
                matchId: matchId || null
              }
            }
          );

          await tx.coinMatchStake.upsert({
            where: {
              roomId_playerId_stakeTableId: {
                roomId,
                playerId: player.id,
                stakeTableId: stakeTable.id
              }
            },
            update: {
              status: "reserved",
              matchId: payload.matchId || null,
              stakeAmount: stakeTable.stakeAmount,
              commissionBps: stakeTable.commissionBps,
              reservedAt: new Date()
            },
            create: {
              roomId,
              matchId: payload.matchId || null,
              playerId: player.id,
              stakeTableId: stakeTable.id,
              stakeAmount: stakeTable.stakeAmount,
              commissionBps: stakeTable.commissionBps,
              status: "reserved"
            }
          });
        }

        return {
          ok: true,
          stakeKey,
          roomId,
          reserved: resolved.length * stakeTable.stakeAmount,
          participants: resolved.length,
          commissionBps: stakeTable.commissionBps
        };
      });

      return result;
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "reserve_failed"
      };
    }
  }

  async settleMatchStake(token: string, payload: SettlePayload = {}) {
    const claims = verifyGameToken(token);
    if (!claims) {
      return {
        ok: false,
        reason: "invalid_token"
      };
    }

    await this.ensureBootstrap();
    const roomId = toCleanString(payload.roomId);
    const matchId = toCleanString(payload.matchId);
    const stakeKey = toCleanString(payload.stakeKey, "free") || "free";
    const result = toCleanString(payload.result, "win");
    const winnerPlayerIds = new Set((payload.winnerPlayerIds || []).map((value) => toCleanString(value)).filter(Boolean));
    const winnerUserIds = new Set((payload.winnerUserIds || []).map((value) => toCleanString(value)).filter(Boolean));

    if (!roomId) {
      return {
        ok: false,
        reason: "missing_room"
      };
    }

    const stakeTable = await this.prisma.coinStakeTable.findUnique({
      where: { key: stakeKey }
    });
    if (!stakeTable || !stakeTable.isActive || stakeTable.stakeAmount <= 0) {
      return {
        ok: true,
        settled: 0,
        stakeKey,
        commission: 0,
        payout: 0
      };
    }

    const resultSummary = await this.prisma.$transaction(async (tx) => {
      const reservations = await tx.coinMatchStake.findMany({
        where: {
          roomId,
          stakeTableId: stakeTable.id,
          status: "reserved"
        },
        include: {
          player: true,
          stakeTable: true
        }
      });

      if (!reservations.length) {
        return {
          ok: true,
          settled: 0,
          stakeKey,
          commission: 0,
          payout: 0,
          skipped: true
        };
      }

      const bank = reservations.reduce((sum, entry) => sum + Math.max(0, entry.stakeAmount), 0);
      const drawOrRefund = result === "draw" || result === "refund" || (!winnerPlayerIds.size && !winnerUserIds.size);
      const commission = drawOrRefund ? 0 : calcCommission(bank, stakeTable.commissionBps);
      const payoutPool = drawOrRefund ? bank : Math.max(0, bank - commission);
      const payoutIds = new Set<string>();

      for (const reservation of reservations) {
        const winnerByPlayer = winnerPlayerIds.has(reservation.playerId);
        const winnerByUser = reservation.player.userId ? winnerUserIds.has(reservation.player.userId) : false;
        if (winnerByPlayer || winnerByUser) {
          payoutIds.add(reservation.playerId);
        }
      }

      const payoutCount = payoutIds.size;
      const payoutShareBase = payoutCount > 0 ? Math.floor(payoutPool / payoutCount) : 0;
      const payoutRemainder = payoutCount > 0 ? payoutPool - payoutShareBase * payoutCount : 0;
      const payoutOrder = Array.from(payoutIds);

      const settled = [];
      for (const reservation of reservations) {
        const isWinner = payoutIds.has(reservation.playerId);
        const wallet = await this.ensureWallet(tx, reservation.playerId);

        if (drawOrRefund) {
          const updated = await this.releaseWallet(
            tx,
            reservation.playerId,
            reservation.stakeAmount,
            "refund",
            "match_settle",
            matchId || roomId,
            {
              idempotencyKey: `${roomId}:${matchId || "match"}:${reservation.playerId}:${stakeTable.id}:refund`,
              note: stakeTable.title,
              payloadJson: {
                roomId,
                matchId: matchId || null,
                stakeKey,
                result
              }
            }
          );
          settled.push({
            playerId: reservation.playerId,
            userId: reservation.player.userId || null,
            wallet: updated,
            payout: reservation.stakeAmount
          });
        } else if (isWinner) {
          const payoutShare = payoutShareBase + (payoutRemainder > 0 && payoutOrder[0] === reservation.playerId ? payoutRemainder : 0);
          const released = await this.releaseWallet(
            tx,
            reservation.playerId,
            reservation.stakeAmount,
            "release",
            "match_settle",
            matchId || roomId,
            {
              idempotencyKey: `${roomId}:${matchId || "match"}:${reservation.playerId}:${stakeTable.id}:release`,
              note: stakeTable.title,
              payloadJson: {
                roomId,
                matchId: matchId || null,
                stakeKey,
                result
              }
            }
          );
          const updated = await this.creditWallet(
            tx,
            reservation.playerId,
            payoutShare,
            "payout",
            "match_settle",
            matchId || roomId,
            {
              idempotencyKey: `${roomId}:${matchId || "match"}:${reservation.playerId}:${stakeTable.id}:payout`,
              note: stakeTable.title,
              payloadJson: {
                roomId,
                matchId: matchId || null,
                stakeKey,
                result,
                payoutShare
              }
            }
          );
          settled.push({
            playerId: reservation.playerId,
            userId: reservation.player.userId || null,
            wallet: updated,
            payout: payoutShare
          });
          void released;
        } else {
          const consumed = await this.consumeReservedWallet(
            tx,
            reservation.playerId,
            reservation.stakeAmount,
            "match_settle",
            matchId || roomId,
            {
              idempotencyKey: `${roomId}:${matchId || "match"}:${reservation.playerId}:${stakeTable.id}:consume`,
              note: stakeTable.title,
              payloadJson: {
                roomId,
                matchId: matchId || null,
                stakeKey,
                result
              }
            }
          );
          settled.push({
            playerId: reservation.playerId,
            userId: reservation.player.userId || null,
            wallet: consumed,
            payout: 0
          });
        }

        await tx.coinMatchStake.update({
          where: { id: reservation.id },
          data: {
            status: drawOrRefund ? "refunded" : "settled",
            matchId: matchId || reservation.matchId,
            commissionAmount: drawOrRefund ? 0 : commission,
            settledAt: new Date()
          }
        });
      }

      return {
        ok: true,
        settled: settled.length,
        stakeKey,
        bank,
        commission,
        payout: drawOrRefund ? 0 : payoutPool,
        winners: payoutIds.size,
        result,
        reservations: settled
      };
    });

    return resultSummary;
  }

  async reserveSoloMatchStake(token: string, payload: { matchId?: string | null; stakeKey?: string | null; difficulty?: string | null } = {}) {
    const claims = verifyGameToken(token);
    if (!claims) {
      return {
        ok: false,
        reason: "invalid_token"
      };
    }

    await this.ensureBootstrap();
    const matchId = toCleanString(payload.matchId, claims.sessionId || claims.userId || claims.playerId || "");
    const stakeKey = toCleanString(payload.stakeKey, "free") || "free";
    const difficulty = toCleanString(payload.difficulty, "medium") || "medium";
    const roomId = `solo:${matchId || claims.sessionId || claims.playerId || Date.now().toString(36)}`;

    if (!matchId) {
      return {
        ok: false,
        reason: "missing_match"
      };
    }
    if (difficulty === "easy" && stakeKey !== "free") {
      return {
        ok: false,
        reason: "easy_mode_free_only"
      };
    }

    const stakeTable = await this.prisma.coinStakeTable.findUnique({
      where: { key: stakeKey }
    });

    if (!stakeTable || !stakeTable.isActive || stakeTable.stakeAmount <= 0) {
      return {
        ok: true,
        reserved: 0,
        stakeKey,
        commissionBps: 0
      };
    }

    if (stakeTable.stakeAmount > SOLO_MAX_STAKE) {
      return {
        ok: false,
        reason: "solo_stake_limit"
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const player = await this.findOrCreatePlayerByIdentity(tx, {
          playerId: claims.playerId || undefined,
          userId: claims.userId || undefined,
          displayName: claims.displayName || "Player"
        }, claims.displayName || "Player");

        const existing = await tx.coinMatchStake.findUnique({
          where: {
            roomId_playerId_stakeTableId: {
              roomId,
              playerId: player.id,
              stakeTableId: stakeTable.id
            }
          }
        });
        if (existing && existing.status === "reserved") {
          return {
            ok: true,
            reserved: stakeTable.stakeAmount,
            stakeKey,
            roomId,
            commissionBps: stakeTable.commissionBps,
            reused: true
          };
        }

        await this.reserveWallet(
          tx,
          player.id,
          stakeTable.stakeAmount,
          "solo_match_reserve",
          roomId,
          {
            idempotencyKey: `${roomId}:${player.id}:${stakeTable.id}:reserve`,
            note: `Solo ${stakeTable.title}`,
            payloadJson: {
              stakeKey,
              roomId,
              matchId,
              difficulty,
              playerId: player.id
            }
          }
        );

        await tx.coinMatchStake.upsert({
          where: {
            roomId_playerId_stakeTableId: {
              roomId,
              playerId: player.id,
              stakeTableId: stakeTable.id
            }
          },
          update: {
            status: "reserved",
            matchId,
            stakeAmount: stakeTable.stakeAmount,
            commissionBps: stakeTable.commissionBps,
            reservedAt: new Date()
          },
          create: {
            roomId,
            matchId,
            playerId: player.id,
            stakeTableId: stakeTable.id,
            stakeAmount: stakeTable.stakeAmount,
            commissionBps: stakeTable.commissionBps,
            status: "reserved"
          }
        });

        return {
          ok: true,
          stakeKey,
          roomId,
          reserved: stakeTable.stakeAmount,
          commissionBps: stakeTable.commissionBps
        };
      });

      return result;
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "reserve_failed"
      };
    }
  }

  async settleSoloMatchStake(token: string, payload: { matchId?: string | null; stakeKey?: string | null; result?: "win" | "draw" | "refund" | "loss" | string | null; difficulty?: string | null } = {}) {
    const claims = verifyGameToken(token);
    if (!claims) {
      return {
        ok: false,
        reason: "invalid_token"
      };
    }

    await this.ensureBootstrap();
    const matchId = toCleanString(payload.matchId, claims.sessionId || claims.userId || claims.playerId || "");
    const stakeKey = toCleanString(payload.stakeKey, "free") || "free";
    const result = toCleanString(payload.result, "win");
    const roomId = `solo:${matchId || claims.sessionId || claims.playerId || Date.now().toString(36)}`;

    if (!matchId) {
      return {
        ok: false,
        reason: "missing_match"
      };
    }

    const stakeTable = await this.prisma.coinStakeTable.findUnique({
      where: { key: stakeKey }
    });
    if (!stakeTable || !stakeTable.isActive || stakeTable.stakeAmount <= 0) {
      return {
        ok: true,
        settled: 0,
        stakeKey,
        commission: 0,
        payout: 0
      };
    }

    if (stakeTable.stakeAmount > SOLO_MAX_STAKE) {
      return {
        ok: false,
        reason: "solo_stake_limit"
      };
    }

    const resultSummary = await this.prisma.$transaction(async (tx) => {
      const player = await this.findOrCreatePlayerByIdentity(tx, {
        playerId: claims.playerId || undefined,
        userId: claims.userId || undefined,
        displayName: claims.displayName || "Player"
      }, claims.displayName || "Player");

      const reservation = await tx.coinMatchStake.findFirst({
        where: {
          roomId,
          playerId: player.id,
          stakeTableId: stakeTable.id
        },
        include: {
          player: true,
          stakeTable: true
        },
        orderBy: { reservedAt: "desc" }
      });

      if (!reservation) {
        return {
          ok: true,
          settled: 0,
          stakeKey,
          commission: 0,
          payout: 0,
          skipped: true
        };
      }

      const drawOrRefund = result === "draw" || result === "refund";
      const commission = drawOrRefund ? 0 : calcCommission(reservation.stakeAmount * 2, stakeTable.commissionBps);
      const payout = drawOrRefund ? reservation.stakeAmount : Math.max(0, reservation.stakeAmount - commission);

      let wallet;
      if (drawOrRefund) {
        wallet = await this.releaseWallet(
          tx,
          reservation.playerId,
          reservation.stakeAmount,
          "refund",
          "solo_match_settle",
          matchId,
          {
          idempotencyKey: `${roomId}:${matchId}:${reservation.playerId}:${stakeTable.id}:refund`,
            note: stakeTable.title,
            payloadJson: {
              roomId,
              matchId,
              stakeKey,
              result
            }
          }
        );
      } else if (result === "win") {
        const released = await this.releaseWallet(
          tx,
          reservation.playerId,
          reservation.stakeAmount,
          "release",
          "solo_match_settle",
          matchId,
          {
            idempotencyKey: `${roomId}:${matchId}:${reservation.playerId}:${stakeTable.id}:release`,
            note: stakeTable.title,
            payloadJson: {
              roomId,
              matchId,
              stakeKey,
              result
            }
          }
        );
        wallet = await this.creditWallet(
          tx,
          reservation.playerId,
          payout,
          "payout",
          "solo_match_settle",
          matchId,
          {
            idempotencyKey: `${roomId}:${matchId}:${reservation.playerId}:${stakeTable.id}:payout`,
            note: stakeTable.title,
            payloadJson: {
              roomId,
              matchId,
              stakeKey,
              result,
              payout
            }
          }
        );
        void released;
      } else {
        wallet = await this.consumeReservedWallet(
          tx,
          reservation.playerId,
          reservation.stakeAmount,
          "solo_match_settle",
          matchId,
          {
            idempotencyKey: `${roomId}:${matchId}:${reservation.playerId}:${stakeTable.id}:consume`,
            note: stakeTable.title,
            payloadJson: {
              roomId,
              matchId,
              stakeKey,
              result
            }
          }
        );
      }

      await tx.coinMatchStake.update({
        where: { id: reservation.id },
        data: {
          status: drawOrRefund ? "refunded" : "settled",
          matchId,
          commissionAmount: commission,
          settledAt: new Date()
        }
      });

      return {
        ok: true,
        settled: 1,
        stakeKey,
        roomId,
        commission,
        payout: drawOrRefund ? reservation.stakeAmount : payout,
        result,
        reservations: [
          {
            playerId: reservation.playerId,
            userId: reservation.player.userId || null,
            wallet,
            payout: drawOrRefund ? reservation.stakeAmount : payout
          }
        ]
      };
    });

    return resultSummary;
  }

  async getMatchStakeOverview(headers: IncomingHttpHeaders) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const [reservedCount, stakeRows, recentReservations] = await Promise.all([
      this.prisma.coinMatchStake.count({ where: { status: "reserved" } }),
      this.prisma.coinStakeTable.findMany({
        orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }]
      }),
      this.prisma.coinMatchStake.findMany({
        take: 50,
        orderBy: { reservedAt: "desc" },
        include: {
          player: {
            include: {
              user: true
            }
          },
          stakeTable: true
        }
      })
    ]);

    return {
      reservedCount,
      stakes: stakeRows.map(formatStakeSummary),
      reservations: recentReservations
    };
  }

  async listAdminQuests(headers: IncomingHttpHeaders) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();
    const quests = await this.prisma.coinQuest.findMany({
      orderBy: [{ isActive: "desc" }, { rewardAmount: "desc" }, { title: "asc" }],
      include: {
        progress: {
          take: 3,
          orderBy: { updatedAt: "desc" }
        }
      }
    });
    return { items: quests };
  }

  async listAdminTournaments(headers: IncomingHttpHeaders) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();
    const tournaments = await this.prisma.coinTournament.findMany({
      orderBy: [{ isActive: "desc" }, { startsAt: "asc" }, { updatedAt: "desc" }],
      include: {
        entries: {
          take: 3,
          orderBy: { joinedAt: "desc" },
          include: {
            player: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });
    return { items: tournaments };
  }

  async upsertStakeTable(headers: IncomingHttpHeaders, payload: EconomyStakeTablePayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const key = toCleanString(payload.key);
    if (!key) {
      throw new BadRequestException("Stake key is required");
    }

    const data = {
      key,
      title: toCleanString(payload.title) || key,
      stakeAmount: Math.max(0, toInt(payload.stakeAmount)),
      commissionBps: Math.max(0, toInt(payload.commissionBps, 500)),
      isFree: Boolean(payload.isFree),
      isActive: payload.isActive !== false,
      sortOrder: Math.max(0, toInt(payload.sortOrder, 0))
    };

    if (payload.id) {
      const updated = await this.prisma.coinStakeTable.update({
        where: { id: payload.id },
        data
      });
      await this.recordAdminAction(this.prisma, session.user.id, "economy.stake.update", "CoinStakeTable", updated.id, {
        key: updated.key,
        stakeAmount: updated.stakeAmount,
        commissionBps: updated.commissionBps,
        isFree: updated.isFree,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder
      });
      return updated;
    }

    const created = await this.prisma.coinStakeTable.upsert({
      where: { key },
      update: data,
      create: data
    });
    await this.recordAdminAction(this.prisma, session.user.id, "economy.stake.upsert", "CoinStakeTable", created.id, {
      key: created.key,
      stakeAmount: created.stakeAmount,
      commissionBps: created.commissionBps,
      isFree: created.isFree,
      isActive: created.isActive,
      sortOrder: created.sortOrder
    });
    return created;
  }

  async upsertQuest(headers: IncomingHttpHeaders, payload: EconomyQuestPayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const key = toCleanString(payload.key);
    if (!key) {
      throw new BadRequestException("Quest key is required");
    }

    const data = {
      key,
      title: toCleanString(payload.title) || key,
      description: payload.description ? toCleanString(payload.description) : null,
      rewardAmount: Math.max(0, toInt(payload.rewardAmount)),
      maxProgress: Math.max(1, toInt(payload.maxProgress, 1)),
      period: toCleanString(payload.period, "once") || "once",
      isActive: payload.isActive !== false
    };

    if (payload.id) {
      const updated = await this.prisma.coinQuest.update({
        where: { id: payload.id },
        data
      });
      await this.recordAdminAction(this.prisma, session.user.id, "economy.quest.update", "CoinQuest", updated.id, {
        key: updated.key,
        title: updated.title,
        rewardAmount: updated.rewardAmount,
        maxProgress: updated.maxProgress,
        period: updated.period,
        isActive: updated.isActive
      });
      return updated;
    }

    const created = await this.prisma.coinQuest.upsert({
      where: { key },
      update: data,
      create: data
    });
    await this.recordAdminAction(this.prisma, session.user.id, "economy.quest.upsert", "CoinQuest", created.id, {
      key: created.key,
      title: created.title,
      rewardAmount: created.rewardAmount,
      maxProgress: created.maxProgress,
      period: created.period,
      isActive: created.isActive
    });
    return created;
  }

  async upsertTournament(headers: IncomingHttpHeaders, payload: EconomyTournamentPayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const key = toCleanString(payload.key);
    if (!key) {
      throw new BadRequestException("Tournament key is required");
    }

    const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;
    const data = {
      key,
      title: toCleanString(payload.title) || key,
      description: payload.description ? toCleanString(payload.description) : null,
      entryFee: Math.max(0, toInt(payload.entryFee)),
      prizePool: Math.max(0, toInt(payload.prizePool)),
      commissionBps: Math.max(0, toInt(payload.commissionBps, 1000)),
      startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
      endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
      isActive: payload.isActive !== false
    };

    if (payload.id) {
      const updated = await this.prisma.coinTournament.update({
        where: { id: payload.id },
        data
      });
      await this.recordAdminAction(this.prisma, session.user.id, "economy.tournament.update", "CoinTournament", updated.id, {
        key: updated.key,
        title: updated.title,
        entryFee: updated.entryFee,
        prizePool: updated.prizePool,
        commissionBps: updated.commissionBps,
        startsAt: updated.startsAt ? updated.startsAt.toISOString() : null,
        endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
        isActive: updated.isActive
      });
      return updated;
    }

    const created = await this.prisma.coinTournament.upsert({
      where: { key },
      update: data,
      create: data
    });
    await this.recordAdminAction(this.prisma, session.user.id, "economy.tournament.upsert", "CoinTournament", created.id, {
      key: created.key,
      title: created.title,
      entryFee: created.entryFee,
      prizePool: created.prizePool,
      commissionBps: created.commissionBps,
      startsAt: created.startsAt ? created.startsAt.toISOString() : null,
      endsAt: created.endsAt ? created.endsAt.toISOString() : null,
      isActive: created.isActive
    });
    return created;
  }

  async updateEconomyConfig(headers: IncomingHttpHeaders, payload: EconomyConfigPayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const updated = await this.prisma.coinEconomyConfig.update({
      where: { key: DEFAULT_CONFIG_KEY },
      data: {
        dailyBaseAmount: payload.dailyBaseAmount === undefined ? undefined : Math.max(0, toInt(payload.dailyBaseAmount)),
        dailyStreakBonus: payload.dailyStreakBonus === undefined ? undefined : Math.max(0, toInt(payload.dailyStreakBonus)),
        dailyMaxStreak: payload.dailyMaxStreak === undefined ? undefined : Math.max(1, toInt(payload.dailyMaxStreak)),
        dailyClaimCooldown: payload.dailyClaimCooldown === undefined ? undefined : Math.max(1, toInt(payload.dailyClaimCooldown)),
        matchCommissionBps: payload.matchCommissionBps === undefined ? undefined : Math.max(0, toInt(payload.matchCommissionBps)),
        tournamentCommissionBps: payload.tournamentCommissionBps === undefined ? undefined : Math.max(0, toInt(payload.tournamentCommissionBps)),
        adRewardAmount: payload.adRewardAmount === undefined ? undefined : Math.max(0, toInt(payload.adRewardAmount))
      }
    });
    await this.recordAdminAction(this.prisma, session.user.id, "economy.config.update", "CoinEconomyConfig", updated.id, {
      dailyBaseAmount: updated.dailyBaseAmount,
      dailyStreakBonus: updated.dailyStreakBonus,
      dailyMaxStreak: updated.dailyMaxStreak,
      dailyClaimCooldown: updated.dailyClaimCooldown,
      matchCommissionBps: updated.matchCommissionBps,
      tournamentCommissionBps: updated.tournamentCommissionBps,
      adRewardAmount: updated.adRewardAmount
    });
    return updated;
  }

  async listCatalog(headers: IncomingHttpHeaders) {
    await this.requireAdmin(headers);
    await this.ensureBootstrap();
    return this.prisma.catalogProduct.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        prices: {
          orderBy: { amountMinor: "asc" }
        }
      }
    });
  }

  async listTableSkins(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    await this.ensureBootstrap();

    const skinKeys = DEFAULT_TABLE_SKINS.map((skin) => skin.key);
    const [player, products, entitlements, wallet] = await Promise.all([
      this.prisma.player.findUnique({
        where: { id: profile.player.id },
        select: { tableSkinKey: true }
      }),
      this.prisma.catalogProduct.findMany({
        where: {
          key: {
            in: skinKeys
          },
          isActive: true
        },
        include: {
          prices: {
            where: { isActive: true },
            orderBy: { amountMinor: "asc" }
          }
        }
      }),
      this.prisma.playerEntitlement.findMany({
        where: {
          playerId: profile.player.id,
          productKey: {
            in: skinKeys
          }
        },
        select: {
          productKey: true,
          quantity: true
        }
      }),
      this.ensureWallet(this.prisma, profile.player.id)
    ]);

    const productMap = new Map(products.map((product) => [product.key, product]));
    const ownedKeys = new Set(
      entitlements
        .filter((entry) => Number(entry.quantity || 0) > 0)
        .map((entry) => entry.productKey)
    );

    const tableSkins = [
      {
        key: DEFAULT_TABLE_SKIN_KEY,
        name: "Standard Felt",
        description: "Classic table surface.",
        assetUrl: null,
        price: 0,
        owned: true,
        equipped: !player?.tableSkinKey,
        isActive: true
      },
      ...DEFAULT_TABLE_SKINS.map((skin) => {
      const product = productMap.get(skin.key);
      const price = product?.prices?.find((entry) => String(entry.currency || "").toUpperCase() === "COIN");
      return {
        key: skin.key,
        name: skin.name,
        description: skin.description,
        assetUrl: getTableSkinAssetUrl(skin.key),
        price: Number(price?.amountMinor ?? 200),
        owned: ownedKeys.has(skin.key),
        equipped: player?.tableSkinKey === skin.key,
        isActive: product ? Boolean(product.isActive) : true
      };
      })
    ];

    return {
      wallet: {
        ...wallet,
        availableBalance: Math.max(0, wallet.balance),
        spendableBalance: Math.max(0, wallet.balance),
        reservedBalance: wallet.reserved
      },
      equippedKey: player?.tableSkinKey || null,
      tableSkins
    };
  }

  async upsertCatalog(headers: IncomingHttpHeaders, payload: { id?: string; key: string; name: string; description?: string | null; coinCost?: number; isActive?: boolean }) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const key = toCleanString(payload.key);
    if (!key) {
      throw new BadRequestException("Catalog key is required");
    }

    const product = payload.id
      ? await this.prisma.catalogProduct.update({
          where: { id: payload.id },
          data: {
            key,
            name: toCleanString(payload.name) || key,
            description: payload.description ? toCleanString(payload.description) : null,
            isActive: payload.isActive !== false
          }
        })
      : await this.prisma.catalogProduct.upsert({
          where: { key },
          update: {
            name: toCleanString(payload.name) || key,
            description: payload.description ? toCleanString(payload.description) : null,
            isActive: payload.isActive !== false
          },
          create: {
            key,
            name: toCleanString(payload.name) || key,
            description: payload.description ? toCleanString(payload.description) : null,
            isActive: payload.isActive !== false
          }
        });

    if (payload.coinCost !== undefined) {
      const nextCost = Math.max(0, toInt(payload.coinCost));
      const existingPrice = await this.prisma.catalogPrice.findFirst({
        where: {
          productId: product.id,
          currency: "COIN"
        }
      });

      if (existingPrice) {
        await this.prisma.catalogPrice.update({
          where: { id: existingPrice.id },
          data: {
            amountMinor: nextCost,
            isActive: true
          }
        });
      } else {
        await this.prisma.catalogPrice.create({
          data: {
            productId: product.id,
            currency: "COIN",
            amountMinor: nextCost,
            isActive: true
          }
        });
      }
    }

    await this.recordAdminAction(this.prisma, session.user.id, "economy.catalog.upsert", "CatalogProduct", product.id, {
      key: product.key,
      name: product.name,
      description: product.description,
      coinCost: payload.coinCost ?? null,
      isActive: product.isActive
    });

    return product;
  }

  async purchaseTableSkin(headers: IncomingHttpHeaders, key: string) {
    const skinKey = toCleanString(key);
    if (!DEFAULT_TABLE_SKINS.some((skin) => skin.key === skinKey)) {
      throw new BadRequestException("Table skin not found");
    }

    const result = await this.purchaseCosmetic(headers, skinKey, 1);
    const profile = await this.authService.getCurrentProfile(headers);
    return {
      ...result,
      equippedKey: profile?.player?.tableSkinKey || null
    };
  }

  async equipDefaultTableSkin(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    const player = await this.prisma.player.update({
      where: { id: profile.player.id },
      data: {
        tableSkinKey: null
      }
    });

    return {
      equippedKey: player.tableSkinKey,
      owned: true
    };
  }

  async equipTableSkin(headers: IncomingHttpHeaders, key: string) {
    const skinKey = toCleanString(key);
    if (!DEFAULT_TABLE_SKINS.some((skin) => skin.key === skinKey)) {
      throw new BadRequestException("Table skin not found");
    }

    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player) {
      throw new UnauthorizedException("Login required");
    }

    const entitlement = await this.prisma.playerEntitlement.findUnique({
      where: {
        playerId_productKey: {
          playerId: profile.player.id,
          productKey: skinKey
        }
      }
    });

    if (!entitlement || Number(entitlement.quantity || 0) <= 0) {
      throw new BadRequestException("Table skin not owned");
    }

    const player = await this.prisma.player.update({
      where: { id: profile.player.id },
      data: {
        tableSkinKey: skinKey
      }
    });

    return {
      equippedKey: player.tableSkinKey,
      owned: true
    };
  }

  async grantCoins(headers: IncomingHttpHeaders, playerId: string, payload: EconomyGrantPayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const amount = Math.max(0, toInt(payload.amount));
    if (!amount) {
      throw new BadRequestException("Amount must be positive");
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.creditWallet(
        tx,
        playerId,
        amount,
        "admin_adjustment",
        "admin_grant",
        `${playerId}:${payload.idempotencyKey || amount}:${payload.reason || "grant"}`,
        {
          idempotencyKey: payload.idempotencyKey || undefined,
          note: payload.reason || "Admin grant",
          payloadJson: {
            amount,
            reason: payload.reason || "grant",
            note: payload.note || null
          },
          createdByUserId: session.user.id
        }
      );

      await this.recordAdminAction(tx, session.user.id, "economy.wallet.grant", "CoinWallet", wallet.id, {
        playerId,
        amount,
        reason: payload.reason || "grant",
        note: payload.note || null
      });

      return {
        wallet,
        amount
      };
    });
  }

  async spendCoins(headers: IncomingHttpHeaders, playerId: string, payload: EconomyGrantPayload) {
    const session = await this.requireAdmin(headers);
    await this.ensureBootstrap();

    const amount = Math.max(0, toInt(payload.amount));
    if (!amount) {
      throw new BadRequestException("Amount must be positive");
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.debitWallet(
        tx,
        playerId,
        amount,
        "admin_adjustment",
        "admin_spend",
        `${playerId}:${payload.idempotencyKey || amount}:${payload.reason || "spend"}`,
        {
          idempotencyKey: payload.idempotencyKey || undefined,
          note: payload.reason || "Admin spend",
          payloadJson: {
            amount,
            reason: payload.reason || "spend",
            note: payload.note || null
          },
          createdByUserId: session.user.id
        }
      );

      await this.recordAdminAction(tx, session.user.id, "economy.wallet.spend", "CoinWallet", wallet.id, {
        playerId,
        amount,
        reason: payload.reason || "spend",
        note: payload.note || null
      });

      return {
        wallet,
        amount
      };
    });
  }

  private async advanceQuestProgressInternal(
    db: EconomyTx,
    playerId: string,
    questKey: string,
    amount: number,
    meta: { source: string; referenceId?: string | null }
  ) {
    await this.ensureBootstrap(db);
    const nextAmount = Math.max(1, Math.trunc(amount) || 1);
    const quest = await db.coinQuest.findUnique({
      where: { key: questKey }
    });
    if (!quest || !quest.isActive) {
      throw new BadRequestException("Quest not found");
    }

    const progress = await db.coinQuestProgress.upsert({
      where: {
        playerId_questId: {
          playerId,
          questId: quest.id
        }
      },
      update: {
        progress: {
          increment: nextAmount
        },
        state: "active"
      },
      create: {
        playerId,
        questId: quest.id,
        progress: nextAmount,
        state: "active"
      }
    });

    if (progress.progress >= quest.maxProgress) {
      return db.coinQuestProgress.update({
        where: {
          playerId_questId: {
            playerId,
            questId: quest.id
          }
        },
        data: {
          progress: quest.maxProgress,
          state: "completed",
          completedAt: new Date()
        }
      });
    }

    return progress;
  }
}
