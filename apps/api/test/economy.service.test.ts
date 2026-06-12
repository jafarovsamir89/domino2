import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const {
  EconomyService,
  getBakuDateKey,
  getNextBakuMidnight,
  getPreviousBakuDateKey
} = await import("../src/modules/economy/economy.service.js");

test("getPublicConfig hides the free table from the public stake list", async () => {
  const prismaMock = {
    coinEconomyConfig: {
      upsert: async () => ({ key: "default" }),
      findUnique: async () => ({
        key: "default",
        adRewardAmount: 25,
        dailyClaimCooldown: 30
      })
    },
    coinStakeTable: {
      upsert: async () => null,
      findMany: async () => ([
        { id: "1", key: "free", title: "Free table", stakeAmount: 0, commissionBps: 0, isFree: true, isActive: true, sortOrder: 0 },
        { id: "2", key: "stake_50", title: "50 coins", stakeAmount: 50, commissionBps: 500, isFree: false, isActive: true, sortOrder: 1 }
      ])
    },
    catalogProduct: {
      upsert: async ({ create, update }: any) => ({
        id: `catalog:${create?.key || update?.key || "skin"}`,
        key: create?.key || update?.key || "skin",
        name: create?.name || update?.name || "Skin",
        description: create?.description || update?.description || null,
        isActive: true
      }),
      findMany: async () => []
    },
    catalogPrice: {
      findFirst: async () => null,
      update: async (payload: any) => payload.data,
      create: async (payload: any) => payload.data
    },
    playerEntitlement: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({
        id: `entitlement:${create?.productKey || "skin"}`,
        playerId: create?.playerId || "player",
        productKey: create?.productKey || "skin",
        quantity: create?.quantity || 1
      })
    }
  } as any;

  const service = new EconomyService(prismaMock, {} as any);
  const config = await service.getPublicConfig();

  assert.equal(config.stakes.length, 1);
  assert.equal(config.stakes[0].key, "stake_50");
});

test("getPublicConfig exposes the new coin shop reward and packs", async () => {
  const prismaMock = {
    coinEconomyConfig: {
      upsert: async () => ({ key: "default" }),
      findUnique: async () => ({
        key: "default",
        adRewardAmount: 25,
        dailyClaimCooldown: 30
      })
    },
    coinStakeTable: {
      upsert: async () => null,
      findMany: async () => ([
        { id: "1", key: "stake_50", title: "50 coins", stakeAmount: 50, commissionBps: 500, isFree: false, isActive: true, sortOrder: 1 }
      ])
    },
    catalogProduct: {
      upsert: async ({ create, update }: any) => ({
        id: `catalog:${create?.key || update?.key || "skin"}`,
        key: create?.key || update?.key || "skin",
        name: create?.name || update?.name || "Skin",
        description: create?.description || update?.description || null,
        isActive: true
      }),
      findMany: async () => []
    },
    catalogPrice: {
      findFirst: async () => null,
      update: async (payload: any) => payload.data,
      create: async (payload: any) => payload.data
    },
    playerEntitlement: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({
        id: `entitlement:${create?.productKey || "skin"}`,
        playerId: create?.playerId || "player",
        productKey: create?.productKey || "skin",
        quantity: create?.quantity || 1
      })
    }
  } as any;

  const service = new EconomyService(prismaMock, {} as any);
  const config = await service.getPublicConfig();

  assert.equal(config.coinShop.videoReward.amount, 1000);
  assert.equal(config.coinShop.videoReward.cooldownMinutes, 30);
  assert.equal(config.coinShop.packs.length, 5);
    assert.deepEqual(
    config.coinShop.packs.map((pack: any) => ({
      key: pack.key,
      coins: pack.coins,
      bonusCoins: pack.bonusCoins,
      priceLabel: pack.priceLabel
    })),
    [
      { key: "coin_pack_5000", coins: 5000, bonusCoins: 1000, priceLabel: "$0.99" },
      { key: "coin_pack_12000", coins: 12000, bonusCoins: 2000, priceLabel: "$1.99" },
      { key: "coin_pack_32000", coins: 32000, bonusCoins: 4000, priceLabel: "$4.99" },
      { key: "coin_pack_70000", coins: 70000, bonusCoins: 8000, priceLabel: "$9.99" },
      { key: "coin_pack_200000", coins: 200000, bonusCoins: 20000, priceLabel: "$19.99" }
    ]
  );
});

class MockDb {
  claims: any[] = [];
  wallets: Record<string, any> = {};
  ledger: any[] = [];
  systemAudit: any[] = [];
  questProgress: any[] = [];
  quests: Record<string, any> = {
    daily_login: { id: "quest_daily_login", key: "daily_login", isActive: true, maxProgress: 1 }
  };
  config = {
    key: "default",
    dailyBaseAmount: 25,
    dailyStreakBonus: 5,
    dailyMaxStreak: 7,
    dailyClaimCooldown: 20
  };

  coinEconomyConfig = {
    upsert: async () => this.config,
    findUnique: async () => this.config
  };

  coinStakeTable = {
    upsert: async () => null,
    findMany: async () => []
  };

  catalogProduct = {
    upsert: async ({ create, update }: any) => ({
      id: `catalog:${create?.key || update?.key || "skin"}`,
      key: create?.key || update?.key || "skin",
      name: create?.name || update?.name || "Skin",
      description: create?.description || update?.description || null,
      isActive: true
    }),
    findMany: async () => []
  };

  catalogPrice = {
    findFirst: async () => null,
    update: async (payload: any) => payload.data,
    create: async (payload: any) => payload.data
  };

  playerEntitlement = {
    findMany: async () => [],
    findUnique: async () => null,
    upsert: async ({ create }: any) => ({
      id: `entitlement:${create?.productKey || "skin"}`,
      playerId: create?.playerId || "player",
      productKey: create?.productKey || "skin",
      quantity: create?.quantity || 1
    })
  };

  coinWallet = {
    findUnique: async ({ where }: any) => this.wallets[where.playerId] || null,
    upsert: async ({ where, create }: any) => {
      if (!this.wallets[where.playerId]) {
        this.wallets[where.playerId] = {
          id: `wallet_${where.playerId}`,
          playerId: where.playerId,
          balance: create.balance || 0,
          reserved: create.reserved || 0
        };
      }
      return this.wallets[where.playerId];
    },
    update: async ({ where, data }: any) => {
      const w = this.wallets[where.playerId];
      if (data.balance?.increment) w.balance += data.balance.increment;
      if (data.balance?.decrement) w.balance -= data.balance.decrement;
      return w;
    }
  };

  coinDailyBonusClaim = {
    findUnique: async ({ where }: any) => {
      return this.claims.find(c => c.playerId === where.playerId_claimDate.playerId && c.claimDate === where.playerId_claimDate.claimDate) || null;
    },
    findFirst: async ({ where }: any) => {
      return this.claims.filter(c => c.playerId === where.playerId && c.claimDate === where.claimDate)[0] || null;
    },
    create: async ({ data }: any) => {
      const c = { id: `claim_${data.playerId}_${data.claimDate}`, ...data, createdAt: new Date() };
      this.claims.push(c);
      return c;
    }
  };

  coinLedgerEntry = {
    create: async ({ data }: any) => {
      this.ledger.push(data);
      return data;
    }
  };

  systemAuditLog = {
    create: async ({ data }: any) => {
      this.systemAudit.push(data);
      return data;
    }
  };

  coinQuest = {
    findUnique: async ({ where }: any) => this.quests[where.key] || null
  };

  coinQuestProgress = {
    upsert: async ({ where, create, update }: any) => {
      let p = this.questProgress.find(x => x.playerId === where.playerId_questId.playerId && x.questId === where.playerId_questId.questId);
      if (!p) {
        p = { id: `progress_${where.playerId_questId.playerId}`, playerId: where.playerId_questId.playerId, questId: where.playerId_questId.questId, progress: create.progress, state: create.state };
        this.questProgress.push(p);
      } else {
        if (update.progress?.increment) p.progress += update.progress.increment;
      }
      return p;
    },
    update: async ({ where, data }: any) => {
      let p = this.questProgress.find(x => x.playerId === where.playerId_questId.playerId && x.questId === where.playerId_questId.questId);
      if (p) {
        Object.assign(p, data);
      }
      return p;
    }
  };

  $transaction = async (fn: any) => {
    return fn(this);
  };

  $queryRaw = async (query: any) => {
    const playerId = query.values[0];
    if (!this.wallets[playerId]) {
      this.wallets[playerId] = {
        id: `wallet_${playerId}`,
        playerId,
        balance: 0,
        reserved: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0
      };
    }
    return [this.wallets[playerId]];
  };
}

test("Daily Bonus - Unauthenticated status returns 401", async () => {
  const authMock = {
    getCurrentProfile: async () => null
  } as any;
  const service = new EconomyService({} as any, authMock);
  await assert.rejects(
    async () => service.getDailyBonusStatus({}),
    /Login required/i
  );
});

test("Daily Bonus - Authenticated status returns claimable true if no claim today", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");
  const status = await service.getDailyBonusStatus({}, now);
  assert.equal(status.dailyBonus.claimable, true);
  assert.equal(status.dailyBonus.canClaim, true);
  assert.equal(status.dailyBonus.claimedToday, false);
  assert.equal(status.dailyBonus.streakDay, 1);
  assert.equal(status.dailyBonus.todayAmount, 25);
  assert.equal(status.dailyBonus.todayReward.amount, 25);
  assert.equal(status.dailyBonus.tomorrowAmount, 30);
  assert.equal(status.dailyBonus.timezone, "Asia/Baku");
  assert.equal(status.dailyBonus.dailyBonusDateKey, "2024-03-01");
  assert.equal(status.dailyBonus.nextClaimAt, "2024-03-01T20:00:00.000Z");
  assert.equal(status.dailyBonus.dailyBonusNextClaimAt, "2024-03-01T20:00:00.000Z");
});

test("Daily Bonus - Claim credits wallet and advances quest", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Claim first time
  const now = new Date("2024-03-01T18:30:00.000Z");
  const claimRes = await service.claimDailyBonus({}, now);
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claim.amount, 25);
  assert.equal(claimRes.claim.streakDay, 1);
  assert.equal(claimRes.wallet.balance, 25);
  assert.equal(claimRes.dailyBonus.claimedToday, true);
  assert.equal(claimRes.dailyBonus.claimable, false);
  assert.equal(claimRes.dailyBonus.nextClaimAt, "2024-03-01T20:00:00.000Z");

  // Check ledger entry
  assert.equal(mockDb.ledger.length, 1);
  assert.equal(mockDb.ledger[0].type, "daily_bonus");
  assert.equal(mockDb.ledger[0].amount, 25);

  // Check quest progress
  assert.equal(mockDb.questProgress.length, 1);
  assert.equal(mockDb.questProgress[0].progress, 1);
  assert.equal(mockDb.questProgress[0].state, "completed");
});

test("Daily Bonus - Second claim same day returns claimed false", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Claim first time
  const now = new Date("2024-03-01T18:30:00.000Z");
  await service.claimDailyBonus({}, now);
  const initialBalance = mockDb.wallets["player_1"].balance;

  // Claim second time
  const secondRes = await service.claimDailyBonus({}, now);
  assert.equal(secondRes.claimed, false);
  assert.equal(secondRes.wallet.balance, initialBalance);
});

test("Daily Bonus - Previous day claim increases streak", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Seed previous day claim
  const now = new Date("2024-03-01T18:30:00.000Z");
  const yesterdayKey = getPreviousBakuDateKey(now);

  mockDb.claims.push({
    id: "prev_claim",
    playerId: "player_1",
    claimDate: yesterdayKey,
    streakDay: 2,
    amount: 30,
    createdAt: new Date("2024-02-29T19:30:00.000Z")
  });

  const status = await service.getDailyBonusStatus({}, now);
  assert.equal(status.dailyBonus.streakDay, 3);
  assert.equal(status.dailyBonus.todayAmount, 35);
  assert.equal(status.dailyBonus.tomorrowAmount, 40);

  // Execute claim
  const claimRes = await service.claimDailyBonus({}, now);
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claim.streakDay, 3);
  assert.equal(claimRes.claim.amount, 35);
});

test("Daily Bonus - After next Baku midnight claim is allowed", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const firstNow = new Date("2024-03-01T18:30:00.000Z");
  const secondNow = new Date("2024-03-01T20:01:00.000Z");

  const firstClaim = await service.claimDailyBonus({}, firstNow);
  const secondClaim = await service.claimDailyBonus({}, secondNow);

  assert.equal(firstClaim.claim.amount, 25);
  assert.equal(secondClaim.claimed, true);
  assert.equal(secondClaim.claim.streakDay, 2);
  assert.equal(secondClaim.claim.amount, 30);
});

test("Daily Bonus - Missing previous day resets streak to 1", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Seed claim from 2 days ago
  const now = new Date("2024-03-01T18:30:00.000Z");
  const twoDaysAgoKey = getBakuDateKey(new Date("2024-02-28T18:30:00.000Z"));

  mockDb.claims.push({
    id: "old_claim",
    playerId: "player_1",
    claimDate: twoDaysAgoKey,
    streakDay: 2,
    amount: 30,
    createdAt: new Date("2024-02-28T19:30:00.000Z")
  });

  const status = await service.getDailyBonusStatus({}, now);
  assert.equal(status.dailyBonus.streakDay, 1);
  assert.equal(status.dailyBonus.todayAmount, 25);
});

test("Daily Bonus - Streak capped at dailyMaxStreak", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Seed previous day claim with max streak (7)
  const now = new Date("2024-03-01T18:30:00.000Z");
  const yesterdayKey = getPreviousBakuDateKey(now);

  mockDb.claims.push({
    id: "prev_claim",
    playerId: "player_1",
    claimDate: yesterdayKey,
    streakDay: 7,
    amount: 55,
    createdAt: new Date("2024-02-29T19:30:00.000Z")
  });

  const status = await service.getDailyBonusStatus({}, now);
  assert.equal(status.dailyBonus.streakDay, 7); // capped at 7
  assert.equal(status.dailyBonus.todayAmount, 55);
  assert.equal(status.dailyBonus.tomorrowAmount, 55);
});

test("Daily Bonus - Baku helpers resolve date keys and next midnight", async () => {
  const now = new Date("2024-03-01T18:30:00.000Z");
  assert.equal(getBakuDateKey(now), "2024-03-01");
  assert.equal(getPreviousBakuDateKey(now), "2024-02-29");
  assert.equal(getNextBakuMidnight(now).toISOString(), "2024-03-01T20:00:00.000Z");
});
