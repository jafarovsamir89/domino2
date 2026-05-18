import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { createGameToken } = await import("../src/modules/auth/game-token.js");
const { signDominoPayload } = await import("../src/modules/security/domino-proof.js");
const { EconomyService } = await import("../src/modules/economy/economy.service.js");

type Wallet = {
  id: string;
  playerId: string;
  balance: number;
  reserved: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

function makeWallet(playerId: string, balance = 200): Wallet {
  return {
    id: `wallet:${playerId}`,
    playerId,
    balance,
    reserved: 0,
    lifetimeEarned: balance,
    lifetimeSpent: 0
  };
}

function makeEconomyHarness() {
  const wallets = new Map<string, Wallet>();
  const players = new Map<string, any>();
  const stakes = new Map<string, any>();
  const matchStakes: any[] = [];

  const prismaMock = {
    coinStakeTable: {
      findUnique: async ({ where }: any) => stakes.get(where.key) || null
    },
    coinMatchStake: {
      findUnique: async ({ where }: any) => matchStakes.find((row) =>
        row.roomId === where.roomId_playerId_stakeTableId.roomId &&
        row.playerId === where.roomId_playerId_stakeTableId.playerId &&
        row.stakeTableId === where.roomId_playerId_stakeTableId.stakeTableId
      ) || null,
      findFirst: async ({ where }: any) => {
        const rows = matchStakes.filter((row) =>
          row.roomId === where.roomId &&
          row.playerId === where.playerId &&
          row.stakeTableId === where.stakeTableId
        );
        return rows[rows.length - 1] || null;
      },
      findMany: async ({ where }: any) => matchStakes.filter((row) =>
        row.roomId === where.roomId &&
        row.stakeTableId === where.stakeTableId &&
        row.status === where.status
      ),
      upsert: async ({ where, create, update }: any) => {
        const existing = matchStakes.find((row) =>
          row.roomId === where.roomId_playerId_stakeTableId.roomId &&
          row.playerId === where.roomId_playerId_stakeTableId.playerId &&
          row.stakeTableId === where.roomId_playerId_stakeTableId.stakeTableId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = {
          id: `stake:${matchStakes.length + 1}`,
          ...create,
          player: players.get(create.playerId) || { id: create.playerId, userId: create.playerId, displayName: create.playerId }
        };
        matchStakes.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = matchStakes.find((item) => item.id === where.id);
        if (!row) {
          throw new Error("stake row not found");
        }
        Object.assign(row, data);
        return row;
      }
    },
    $transaction: async (fn: any) => fn(prismaMock)
  } as any;

  stakes.set("stake_50", {
    id: "stake-50",
    key: "stake_50",
    title: "50 coins",
    stakeAmount: 50,
    commissionBps: 1000,
    isFree: false,
    isActive: true,
    sortOrder: 1
  });

  const authStub = {} as any;
  const service = new EconomyService(prismaMock, authStub) as any;

  service.ensureBootstrap = async () => {};
  service.findOrCreatePlayerByIdentity = async (_db: any, participant: any, fallbackName: string) => {
    const playerId = String(participant.playerId || participant.userId || fallbackName).trim();
    const wallet = wallets.get(playerId) || makeWallet(playerId);
    wallets.set(playerId, wallet);
    const player = {
      id: playerId,
      userId: participant.userId || playerId,
      displayName: participant.displayName || fallbackName,
      wallet
    };
    players.set(playerId, player);
    return player;
  };
  service.ensureWallet = async (_db: any, playerId: string) => {
    const wallet = wallets.get(playerId) || makeWallet(playerId);
    wallets.set(playerId, wallet);
    return wallet;
  };
  service.getLockedWallet = async (_db: any, playerId: string) => service.ensureWallet(_db, playerId);
  service.reserveWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.balance < amount) throw new Error("Insufficient balance");
    wallet.balance -= amount;
    wallet.reserved += amount;
    return wallet;
  };
  service.releaseWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.reserved < amount) throw new Error("Reserved balance is too small");
    wallet.balance += amount;
    wallet.reserved -= amount;
    return wallet;
  };
  service.creditWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    wallet.balance += amount;
    wallet.lifetimeEarned += amount;
    return wallet;
  };
  service.debitWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.balance < amount) throw new Error("Insufficient balance");
    wallet.balance -= amount;
    wallet.lifetimeSpent += amount;
    return wallet;
  };
  service.consumeReservedWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.reserved < amount) throw new Error("Reserved balance is too small");
    wallet.reserved -= amount;
    wallet.lifetimeSpent += amount;
    return wallet;
  };

  return { service, wallets, matchStakes };
}

function withProof(payload: Record<string, unknown>, scope: string) {
  const body = { ...payload, integrityScope: scope };
  return {
    ...body,
    proof: signDominoPayload(body)
  };
}

test("online stake reserve and settle keep the bank and payout balanced", async () => {
  const { service, wallets } = makeEconomyHarness();
  const token = createGameToken({
    userId: "user-a",
    playerId: "player-a",
    displayName: "Alpha",
    role: "player",
    sessionId: "session-a",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const reserve = await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-online",
      matchId: "match-online",
      stakeKey: "stake_50",
      participants: [
      { playerId: "player-a", userId: "user-a", displayName: "Alpha" },
      { playerId: "player-b", userId: "user-b", displayName: "Beta" }
      ]
    }, "economy.reserve")
  });

  assert.equal(reserve.ok, true);
  assert.equal(reserve.reserved, 100);
  assert.equal(wallets.get("player-a")?.balance, 150);
  assert.equal(wallets.get("player-b")?.balance, 150);
  assert.equal(wallets.get("player-a")?.reserved, 50);
  assert.equal(wallets.get("player-b")?.reserved, 50);

  const settle = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-online",
      matchId: "match-online",
      stakeKey: "stake_50",
      result: "win",
      winnerPlayerIds: ["player-a"],
      winnerUserIds: ["user-a"]
    }, "economy.settle")
  });

  assert.equal(settle.ok, true);
  assert.equal(settle.bank, 100);
  assert.equal(settle.commission, 5);
  assert.equal(settle.payout, 45);
  assert.equal(settle.winnerBank, 50);
  assert.equal(settle.loserBank, 50);
  assert.equal(wallets.get("player-a")?.balance, 245);
  assert.equal(wallets.get("player-a")?.reserved, 0);
  assert.equal(wallets.get("player-b")?.balance, 150);
  assert.equal(wallets.get("player-b")?.reserved, 0);
});

test("online stake reserve deduplicates repeated participants", async () => {
  const { service, wallets } = makeEconomyHarness();
  const token = createGameToken({
    userId: "user-a",
    playerId: "player-a",
    displayName: "Alpha",
    role: "player",
    sessionId: "session-a",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const reserve = await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-dup",
      matchId: "match-dup",
      stakeKey: "stake_50",
      participants: [
        { playerId: "player-a", userId: "user-a", displayName: "Alpha" },
        { playerId: "player-a", userId: "user-a", displayName: "Alpha Duplicate" }
      ]
    }, "economy.reserve")
  });

  assert.equal(reserve.ok, true);
  assert.equal(reserve.reserved, 50);
  assert.equal(reserve.participants, 1);
  assert.equal(wallets.get("player-a")?.balance, 150);
});

test("online team stake settle splits the losing bank across winners", async () => {
  const { service, wallets } = makeEconomyHarness();
  const token = createGameToken({
    userId: "user-team-a",
    playerId: "player-team-a",
    displayName: "Alpha",
    role: "player",
    sessionId: "session-team-a",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const reserve = await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-team",
      matchId: "match-team",
      stakeKey: "stake_50",
      participants: [
      { playerId: "player-team-a", userId: "user-team-a", displayName: "Alpha" },
      { playerId: "player-team-b", userId: "user-team-b", displayName: "Beta" },
      { playerId: "player-team-c", userId: "user-team-c", displayName: "Gamma" },
      { playerId: "player-team-d", userId: "user-team-d", displayName: "Delta" }
      ]
    }, "economy.reserve")
  });

  assert.equal(reserve.ok, true);
  assert.equal(reserve.reserved, 200);

  const settle = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-team",
      matchId: "match-team",
      stakeKey: "stake_50",
      result: "win",
      winnerPlayerIds: ["player-team-a", "player-team-c"],
      winnerUserIds: ["user-team-a", "user-team-c"]
    }, "economy.settle")
  });

  assert.equal(settle.ok, true);
  assert.equal(settle.bank, 200);
  assert.equal(settle.commission, 10);
  assert.equal(settle.payout, 90);
  assert.equal(wallets.get("player-team-a")?.balance, 245);
  assert.equal(wallets.get("player-team-c")?.balance, 245);
  assert.equal(wallets.get("player-team-b")?.balance, 150);
  assert.equal(wallets.get("player-team-d")?.balance, 150);
});

test("solo stake reserve and settle are disabled for coin staking", async () => {
  const { service, wallets } = makeEconomyHarness();
  const token = createGameToken({
    userId: "user-solo",
    playerId: "player-solo",
    displayName: "Solo",
    role: "player",
    sessionId: "session-solo",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const reserve = await service.reserveSoloMatchStake(token, {
    matchId: "match-solo",
    stakeKey: "stake_50",
    difficulty: "medium"
  });

  assert.equal(reserve.ok, false);
  assert.equal(reserve.reason, "solo_stakes_disabled");
  assert.equal(wallets.get("player-solo"), undefined);

  const settle = await service.settleSoloMatchStake(token, {
    matchId: "match-solo",
    stakeKey: "stake_50",
    result: "win",
    difficulty: "medium"
  });

  assert.equal(settle.ok, false);
  assert.equal(settle.reason, "solo_stakes_disabled");
  assert.equal(wallets.get("player-solo"), undefined);
});
