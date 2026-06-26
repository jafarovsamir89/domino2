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
        dailyClaimCooldown: 30,
        dailyRewards: [200, 300, 350, 400, 800, 1000, 2000]
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

test("Daily Bonus - configured dailyRewards control the schedule and extend with streak bonus", async () => {
  const mockDb = new MockDb() as any;
  mockDb.config.dailyRewards = [11, 22];
  mockDb.config.dailyMaxStreak = 5;
  mockDb.config.dailyStreakBonus = 7;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const status = await service.getDailyBonusStatus({}, new Date("2024-03-01T18:30:00.000Z"));
  assert.equal(status.dailyBonus.todayAmount, 11);
  assert.equal(status.dailyBonus.tomorrowAmount, 22);
  assert.deepEqual(
    status.dailyBonus.rewardSchedule.map((reward: any) => reward.amount),
    [11, 22, 29, 36, 43]
  );
});

test("Economy config update stores dailyRewards arrays", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getSession: async () => ({ user: { id: "admin_1", role: "admin" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const updated = await service.updateEconomyConfig({}, { dailyRewards: "[15, 25, 35]" } as any);

  assert.deepEqual(updated.dailyRewards, [15, 25, 35]);
  assert.deepEqual(mockDb.config.dailyRewards, [15, 25, 35]);
});

class MockDb {
  claims: any[] = [];
  wallets: Record<string, any> = {};
  ledger: any[] = [];
  systemAudit: any[] = [];
  adminAudit: any[] = [];
  matchStakes: any[] = [];
  queryRawCalls: any[] = [];
  questProgress: any[] = [];
  quests: Record<string, any> = {
    daily_login: { id: "quest_daily_login", key: "daily_login", isActive: true, maxProgress: 1 }
  };
  config = {
    key: "default",
    dailyBaseAmount: 25,
    dailyStreakBonus: 5,
    dailyMaxStreak: 7,
    dailyRewards: [200, 300, 350, 400, 800, 1000, 2000],
    dailyClaimCooldown: 20
  };

  coinEconomyConfig = {
    upsert: async () => this.config,
    findUnique: async () => this.config,
    update: async ({ data }: any) => {
      Object.assign(this.config, data);
      return this.config;
    }
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
          reserved: create.reserved || 0,
          lifetimeEarned: create.lifetimeEarned || 0,
          lifetimeSpent: create.lifetimeSpent || 0
        };
      }
      return this.wallets[where.playerId];
    },
    update: async ({ where, data }: any) => {
      const w = this.wallets[where.playerId];
      if (data.balance?.increment) w.balance += data.balance.increment;
      if (data.balance?.decrement) w.balance -= data.balance.decrement;
      if (data.reserved?.increment) w.reserved += data.reserved.increment;
      if (data.reserved?.decrement) w.reserved -= data.reserved.decrement;
      if (data.lifetimeEarned?.increment) w.lifetimeEarned += data.lifetimeEarned.increment;
      if (data.lifetimeSpent?.increment) w.lifetimeSpent += data.lifetimeSpent.increment;
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
    },
    update: async ({ where, data }: any) => {
      const c = this.claims.find(x => x.id === where.id);
      if (c && data.amount !== undefined) {
        c.amount = data.amount;
      }
      return c;
    }
  };

  coinLedgerEntry = {
    create: async ({ data }: any) => {
      this.ledger.push(data);
      return data;
    },
    findUnique: async ({ where }: any) => {
      return this.ledger.find(entry => entry.idempotencyKey === where.idempotencyKey) || null;
    }
  };

  systemAuditLog = {
    create: async ({ data }: any) => {
      this.systemAudit.push(data);
      return data;
    }
  };

  adminAuditLog = {
    create: async ({ data }: any) => {
      this.adminAudit.push(data);
      return data;
    }
  };

  coinMatchStake = {
    findMany: async ({ where, orderBy, take, select }: any) => {
      let rows = this.matchStakes.slice();
      if (where?.status) {
        rows = rows.filter(row => row.status === where.status);
      }
      if (where?.reservedAt?.lt) {
        const cutoff = new Date(where.reservedAt.lt).getTime();
        rows = rows.filter(row => new Date(row.reservedAt).getTime() < cutoff);
      }
      rows.sort((a, b) => {
        const aTime = new Date(a.reservedAt).getTime();
        const bTime = new Date(b.reservedAt).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return String(a.id).localeCompare(String(b.id));
      });
      rows = rows.slice(0, take || rows.length);
      if (select) {
        return rows.map(row => {
          const next: any = {};
          for (const key of Object.keys(select)) {
            if (select[key]) next[key] = row[key];
          }
          return next;
        });
      }
      return rows;
    },
    findUnique: async ({ where }: any) => this.matchStakes.find(row =>
      row.id === where.id ||
      (where.roomId_playerId_stakeTableId && row.roomId === where.roomId_playerId_stakeTableId.roomId && row.playerId === where.roomId_playerId_stakeTableId.playerId && row.stakeTableId === where.roomId_playerId_stakeTableId.stakeTableId)
    ) || null,
    update: async ({ where, data }: any) => {
      const row = this.matchStakes.find(entry => entry.id === where.id);
      if (row) {
        Object.assign(row, data);
      }
      return row;
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
    this.queryRawCalls.push(query);
    const text = String(query?.strings?.join?.("") || "");
    if (text.includes('FROM "CoinMatchStake"')) {
      const stakeId = query.values[0];
      const row = this.matchStakes.find(entry => entry.id === stakeId && entry.status === "reserved");
      return row ? [{ id: row.id }] : [];
    }
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
  assert.equal(status.dailyBonus.todayAmount, 200);
  assert.equal(status.dailyBonus.todayReward.amount, 200);
  assert.equal(status.dailyBonus.tomorrowAmount, 300);
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
  assert.equal(claimRes.claimMode, "normal");
  assert.equal(claimRes.baseReward, 200);
  assert.equal(claimRes.multiplier, 1);
  assert.equal(claimRes.reward, 200);
  assert.equal(claimRes.claim.amount, 200);
  assert.equal(claimRes.claim.streakDay, 1);
  assert.equal(claimRes.wallet.balance, 200);
  assert.equal(claimRes.dailyBonus.claimedToday, true);
  assert.equal(claimRes.dailyBonus.claimable, true);
  assert.equal(claimRes.dailyBonus.doubleClaimAvailable, true);
  assert.equal(claimRes.dailyBonus.nextClaimAt, "2024-03-01T20:00:00.000Z");

  // Check ledger entry
  assert.equal(mockDb.ledger.length, 1);
  assert.equal(mockDb.ledger[0].type, "daily_bonus");
  assert.equal(mockDb.ledger[0].amount, 200);

  // Check quest progress
  assert.equal(mockDb.questProgress.length, 1);
  assert.equal(mockDb.questProgress[0].progress, 1);
  assert.equal(mockDb.questProgress[0].state, "completed");
});

test("Daily Bonus - Rewarded x2 claim doubles the reward", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");
  const claimRes = await service.claimDailyBonus({}, { claimMode: "rewarded_x2" } as any, now);
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claimMode, "rewarded_x2");
  assert.equal(claimRes.baseReward, 200);
  assert.equal(claimRes.multiplier, 2);
  assert.equal(claimRes.reward, 400);
  assert.equal(claimRes.claim.amount, 400);
  assert.equal(claimRes.wallet.balance, 400);
  assert.equal(mockDb.ledger[0].amount, 400);
});

test("Daily Bonus - Client amount is ignored", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");
  const claimRes = await service.claimDailyBonus({}, { claimMode: "normal", amount: 9999 } as any, now);
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.reward, 200);
  assert.equal(claimRes.claim.amount, 200);
  assert.equal(mockDb.ledger[0].amount, 200);
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

test("Daily Bonus - Normal claim allows upgrading to rewarded x2 on the same day", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");
  const firstClaim = await service.claimDailyBonus({}, { claimMode: "normal" } as any, now);
  const secondClaim = await service.claimDailyBonus({}, { claimMode: "rewarded_x2" } as any, now);

  assert.equal(firstClaim.claimed, true);
  assert.equal(secondClaim.claimed, true);
  assert.equal(secondClaim.claimMode, "rewarded_x2");
  assert.equal(secondClaim.dailyBonus.claimedToday, true);
  assert.equal(secondClaim.dailyBonus.claimable, false);
  assert.equal(secondClaim.wallet.balance, 400);
});

test("Daily Bonus - Rewarded x2 claim blocks normal claim on the same day", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");
  const firstClaim = await service.claimDailyBonus({}, { claimMode: "rewarded_x2" } as any, now);
  const secondClaim = await service.claimDailyBonus({}, { claimMode: "normal" } as any, now);

  assert.equal(firstClaim.claimed, true);
  assert.equal(firstClaim.reward, 400);
  assert.equal(secondClaim.claimed, false);
  assert.equal(secondClaim.claimMode, "normal");
  assert.equal(secondClaim.dailyBonus.claimedToday, true);
  assert.equal(secondClaim.dailyBonus.canClaim, false);
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
  assert.equal(status.dailyBonus.todayAmount, 350);
  assert.equal(status.dailyBonus.tomorrowAmount, 400);
 
  // Execute claim
  const claimRes = await service.claimDailyBonus({}, now);
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.claim.streakDay, 3);
  assert.equal(claimRes.claim.amount, 350);
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

  assert.equal(firstClaim.claim.amount, 200);
  assert.equal(secondClaim.claimed, true);
  assert.equal(secondClaim.claim.streakDay, 2);
  assert.equal(secondClaim.claim.amount, 300);
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
  assert.equal(status.dailyBonus.todayAmount, 200);
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
  assert.equal(status.dailyBonus.todayAmount, 2000);
  assert.equal(status.dailyBonus.tomorrowAmount, 2000);
});

test("Daily Bonus - Baku helpers resolve date keys and next midnight", async () => {
  const now = new Date("2024-03-01T18:30:00.000Z");
  assert.equal(getBakuDateKey(now), "2024-03-01");
  assert.equal(getPreviousBakuDateKey(now), "2024-02-29");
  assert.equal(getNextBakuMidnight(now).toISOString(), "2024-03-01T20:00:00.000Z");
});

test("Daily Bonus - Normal claim followed by rewarded x2 upgrade credits wallet and updates claim", async () => {
  const mockDb = new MockDb() as any;
  const authMock = {
    getCurrentProfile: async () => ({ player: { id: "player_1" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const now = new Date("2024-03-01T18:30:00.000Z");

  // 1. First claim normal (gives 200)
  const res1 = await service.claimDailyBonus({}, { claimMode: "normal" }, now);
  assert.equal(res1.claimed, true);
  assert.equal(res1.reward, 200);
  assert.equal(res1.wallet.balance, 200);
  assert.equal(res1.dailyBonus.doubleClaimAvailable, true);

  // 2. Second claim with rewarded_x2 (gives extra 200, making it 400 total)
  const res2 = await service.claimDailyBonus({}, { claimMode: "rewarded_x2" }, now);
  assert.equal(res2.claimed, true);
  assert.equal(res2.reward, 200); // the extra credited amount
  assert.equal(res2.wallet.balance, 400); // total balance updated to 400
  assert.equal(res2.claim.amount, 400); // the claim row updated to 400
  assert.equal(res2.dailyBonus.doubleClaimAvailable, false); // no longer available
});

test("reconcileStaleReservedStakes refunds only stale rows and keeps fresh reservations untouched", async () => {
  const mockDb = new MockDb() as any;
  mockDb.wallets.player_1 = {
    id: "wallet_player_1",
    playerId: "player_1",
    balance: 600,
    reserved: 400,
    lifetimeEarned: 0,
    lifetimeSpent: 0
  };
  mockDb.matchStakes.push(
    {
      id: "stake-old",
      roomId: "room-old",
      matchId: "match-old",
      playerId: "player_1",
      stakeTableId: "stake_200",
      stakeAmount: 200,
      status: "reserved",
      reservedAt: new Date(Date.now() - (3 * 60 * 60 * 1000))
    },
    {
      id: "stake-fresh",
      roomId: "room-fresh",
      matchId: "match-fresh",
      playerId: "player_1",
      stakeTableId: "stake_200",
      stakeAmount: 200,
      status: "reserved",
      reservedAt: new Date(Date.now() - (10 * 60 * 1000))
    }
  );
  const authMock = {
    getSession: async () => ({ user: { id: "admin_1", role: "admin" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const summary = await service.reconcileStaleReservedStakes({}, { ttlMinutes: 120, limit: 10 });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.refunded, 1);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.errors, 0);
  assert.equal(summary.ttlMinutes, 120);
  assert.equal(summary.limit, 10);
  assert.equal(mockDb.wallets.player_1.balance, 800);
  assert.equal(mockDb.wallets.player_1.reserved, 200);
  assert.equal(mockDb.matchStakes.find((row: any) => row.id === "stake-old")?.status, "refunded");
  assert.equal(mockDb.matchStakes.find((row: any) => row.id === "stake-fresh")?.status, "reserved");
  assert.equal(mockDb.ledger.filter((entry: any) => entry.idempotencyKey?.endsWith(":refund")).length, 1);
  assert.equal(mockDb.queryRawCalls.some((query: any) => String(query?.strings?.join?.("") || "").includes('FOR UPDATE')), true);
  assert.equal(mockDb.adminAudit.length, 1);
});

test("reconcileStaleReservedStakes treats an existing refund idempotency key as already closed", async () => {
  const mockDb = new MockDb() as any;
  mockDb.wallets.player_1 = {
    id: "wallet_player_1",
    playerId: "player_1",
    balance: 600,
    reserved: 200,
    lifetimeEarned: 0,
    lifetimeSpent: 0
  };
  const idempotencyKey = "room-collision:match-collision:player_1:stake_200:refund";
  mockDb.ledger.push({
    idempotencyKey,
    type: "refund",
    amount: 200
  });
  mockDb.matchStakes.push({
    id: "stake-collision",
    roomId: "room-collision",
    matchId: "match-collision",
    playerId: "player_1",
    stakeTableId: "stake_200",
    stakeAmount: 200,
    status: "reserved",
    reservedAt: new Date(Date.now() - (3 * 60 * 60 * 1000))
  });
  const authMock = {
    getSession: async () => ({ user: { id: "admin_1", role: "admin" } })
  } as any;
  const service = new EconomyService(mockDb, authMock);

  const summary = await service.reconcileStaleReservedStakes({}, { ttlMinutes: 120, limit: 10 });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.refunded, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.errors, 0);
  assert.equal(mockDb.wallets.player_1.balance, 600);
  assert.equal(mockDb.wallets.player_1.reserved, 200);
  assert.equal(mockDb.matchStakes.find((row: any) => row.id === "stake-collision")?.status, "refunded");
  assert.equal(mockDb.ledger.filter((entry: any) => entry.idempotencyKey === idempotencyKey).length, 1);
});
