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
    }
  } as any;

  const service = new EconomyService(prismaMock, {} as any);
  const config = await service.getPublicConfig();

  assert.equal(config.stakes.length, 1);
  assert.equal(config.stakes[0].key, "stake_50");
});
