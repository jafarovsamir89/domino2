import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { EconomyService } = await import("../src/modules/economy/economy.service.js");

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

  const status = await service.getDailyBonusStatus({});
  assert.equal(status.dailyBonus.claimable, true);
  assert.equal(status.dailyBonus.claimedToday, false);
  assert.equal(status.dailyBonus.streakDay, 1);
  assert.equal(status.dailyBonus.todayAmount, 25);
  assert.equal(status.dailyBonus.tomorrowAmount, 30);
});

test("Daily Bonus - Claim credits wallet and advances quest", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Claim first time
  const claimRes = await service.claimDailyBonus({});
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claim.amount, 25);
  assert.equal(claimRes.claim.streakDay, 1);
  assert.equal(claimRes.wallet.balance, 25);
  assert.equal(claimRes.dailyBonus.claimedToday, true);
  assert.equal(claimRes.dailyBonus.claimable, false);

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
  await service.claimDailyBonus({});
  const initialBalance = mockDb.wallets["player_1"].balance;

  // Claim second time
  const secondRes = await service.claimDailyBonus({});
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
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  mockDb.claims.push({
    id: "prev_claim",
    playerId: "player_1",
    claimDate: yesterdayKey,
    streakDay: 2,
    amount: 30,
    createdAt: yesterday
  });

  const status = await service.getDailyBonusStatus({});
  assert.equal(status.dailyBonus.streakDay, 3);
  assert.equal(status.dailyBonus.todayAmount, 35); // 25 + 2 * 5
  assert.equal(status.dailyBonus.tomorrowAmount, 40);

  // Execute claim
  const claimRes = await service.claimDailyBonus({});
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claim.streakDay, 3);
  assert.equal(claimRes.claim.amount, 35);
});

test("Daily Bonus - Missing previous day resets streak to 1", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  // Seed claim from 2 days ago
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const twoDaysAgoKey = twoDaysAgo.toISOString().slice(0, 10);

  mockDb.claims.push({
    id: "old_claim",
    playerId: "player_1",
    claimDate: twoDaysAgoKey,
    streakDay: 2,
    amount: 30,
    createdAt: twoDaysAgo
  });

  const status = await service.getDailyBonusStatus({});
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
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  mockDb.claims.push({
    id: "prev_claim",
    playerId: "player_1",
    claimDate: yesterdayKey,
    streakDay: 7,
    amount: 55,
    createdAt: yesterday
  });

  const status = await service.getDailyBonusStatus({});
  assert.equal(status.dailyBonus.streakDay, 7); // capped at 7
  assert.equal(status.dailyBonus.todayAmount, 55); // 25 + 6 * 5
  assert.equal(status.dailyBonus.tomorrowAmount, 55);
});
