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
  const ledgerEntries: any[] = [];
  const queryRawCalls: any[] = [];

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
      findMany: async ({ where }: any) => {
        const idIn = Array.isArray(where?.id?.in) ? new Set(where.id.in.map((value: any) => String(value))) : null;
        if (idIn) {
          return matchStakes.filter((row) => idIn.has(String(row.id)));
        }
        return matchStakes.filter((row) =>
          row.roomId === where.roomId &&
          row.stakeTableId === where.stakeTableId &&
          row.status === where.status
        );
      },
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
    $queryRaw: async (query: any) => {
      queryRawCalls.push(query);
      const values = Array.isArray(query?.values) ? query.values : [];
      if (!String(query?.strings?.join?.("") || "").includes('FROM "CoinMatchStake"')) {
        return [];
      }
      const roomId = String(values[0] || "");
      const stakeTableId = String(values[1] || "");
      return matchStakes
        .filter((row) =>
          row.roomId === roomId &&
          row.stakeTableId === stakeTableId &&
          row.status === "reserved"
        )
        .map((row) => ({ id: row.id }));
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
  service.reserveWallet = async (_db: any, playerId: string, amount: number, referenceType = "reserve", referenceId = "", extras: any = {}) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.balance < amount) throw new Error("Insufficient balance");
    const before = { balance: wallet.balance, reserved: wallet.reserved };
    wallet.balance -= amount;
    wallet.reserved += amount;
    ledgerEntries.push({
      type: "reserve",
      playerId,
      amount,
      referenceType,
      referenceId,
      idempotencyKey: extras?.idempotencyKey ?? null,
      balanceBefore: before.balance,
      balanceAfter: wallet.balance,
      reservedBefore: before.reserved,
      reservedAfter: wallet.reserved
    });
    return wallet;
  };
  service.releaseWallet = async (_db: any, playerId: string, amount: number, type = "release", referenceType = "", referenceId = "", extras: any = {}) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.reserved < amount) throw new Error("Reserved balance is too small");
    const before = { balance: wallet.balance, reserved: wallet.reserved };
    wallet.balance += amount;
    wallet.reserved -= amount;
    ledgerEntries.push({
      type,
      playerId,
      amount,
      referenceType,
      referenceId,
      idempotencyKey: extras?.idempotencyKey ?? null,
      balanceBefore: before.balance,
      balanceAfter: wallet.balance,
      reservedBefore: before.reserved,
      reservedAfter: wallet.reserved
    });
    return wallet;
  };
  service.creditWallet = async (_db: any, playerId: string, amount: number, type = "payout", referenceType = "", referenceId = "", extras: any = {}) => {
    const wallet = await service.ensureWallet(_db, playerId);
    const before = { balance: wallet.balance, reserved: wallet.reserved };
    wallet.balance += amount;
    wallet.lifetimeEarned += amount;
    ledgerEntries.push({
      type,
      playerId,
      amount,
      referenceType,
      referenceId,
      idempotencyKey: extras?.idempotencyKey ?? null,
      balanceBefore: before.balance,
      balanceAfter: wallet.balance,
      reservedBefore: before.reserved,
      reservedAfter: wallet.reserved
    });
    return wallet;
  };
  service.debitWallet = async (_db: any, playerId: string, amount: number) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.balance < amount) throw new Error("Insufficient balance");
    wallet.balance -= amount;
    wallet.lifetimeSpent += amount;
    return wallet;
  };
  service.consumeReservedWallet = async (_db: any, playerId: string, amount: number, referenceType = "", referenceId = "", extras: any = {}) => {
    const wallet = await service.ensureWallet(_db, playerId);
    if (wallet.reserved < amount) throw new Error("Reserved balance is too small");
    const before = { balance: wallet.balance, reserved: wallet.reserved };
    wallet.reserved -= amount;
    wallet.lifetimeSpent += amount;
    ledgerEntries.push({
      type: "spend",
      playerId,
      amount,
      referenceType,
      referenceId,
      idempotencyKey: extras?.idempotencyKey ?? null,
      balanceBefore: before.balance,
      balanceAfter: wallet.balance,
      reservedBefore: before.reserved,
      reservedAfter: wallet.reserved
    });
    return wallet;
  };

  return { service, wallets, matchStakes, ledgerEntries, queryRawCalls };
}

function withProof(payload: Record<string, unknown>, scope: string) {
  const body = { ...payload, integrityScope: scope };
  return {
    ...body,
    proof: signDominoPayload(body)
  };
}

test("online stake reserve and settle keep the bank and payout balanced", async () => {
  const { service, wallets, matchStakes, ledgerEntries, queryRawCalls } = makeEconomyHarness();
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
  assert.equal(matchStakes.length, 2);
  assert.equal(ledgerEntries.length, 2);
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
  assert.equal(ledgerEntries.length, 5);
  assert.equal(wallets.get("player-a")?.balance, 245);
  assert.equal(wallets.get("player-a")?.reserved, 0);
  assert.equal(wallets.get("player-b")?.balance, 150);
  assert.equal(wallets.get("player-b")?.reserved, 0);
  assert.equal(queryRawCalls.some((query) => String(query?.strings?.join?.("") || "").includes('FOR UPDATE')), true);
});

test("online stake reserve normalizes low balance errors to insufficient_coins", async () => {
  const { service, wallets } = makeEconomyHarness();
  wallets.set("player-low", makeWallet("player-low", 20));

  const token = createGameToken({
    userId: "user-low",
    playerId: "player-low",
    displayName: "Low",
    role: "player",
    sessionId: "session-low",
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });

  const reserve = await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-low",
      matchId: "match-low",
      stakeKey: "stake_50",
      participants: [
        { playerId: "player-low", userId: "user-low", displayName: "Low" }
      ]
    }, "economy.reserve")
  });

  assert.equal(reserve.ok, false);
  assert.equal(reserve.reason, "insufficient_coins");
});

test("online stake reserve rejects an invalid proof", async () => {
  const { service } = makeEconomyHarness();
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

  const payload = withProof({
    roomId: "room-bad-proof",
    matchId: "match-bad-proof",
    stakeKey: "stake_50",
    participants: [
      { playerId: "player-a", userId: "user-a", displayName: "Alpha", teamIndex: 0 }
    ]
  }, "economy.reserve");
  payload.proof = `${payload.proof}-tampered`;

  const reserve = await service.reserveMatchStake(token, payload as any);
  assert.equal(reserve.ok, false);
  assert.equal(reserve.reason, "invalid_proof");
});

test("online stake reserve is idempotent for the same room and match", async () => {
  const { service, wallets, matchStakes, ledgerEntries } = makeEconomyHarness();
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

  const payload = {
    ...withProof({
      roomId: "room-idem-reserve",
      matchId: "match-idem-reserve",
      stakeKey: "stake_50",
      participants: [
        { playerId: "player-a", userId: "user-a", displayName: "Alpha" },
        { playerId: "player-b", userId: "user-b", displayName: "Beta" }
      ]
    }, "economy.reserve")
  };

  const first = await service.reserveMatchStake(token, payload);
  const ledgerAfterFirst = ledgerEntries.map((entry) => ({ ...entry }));
  const second = await service.reserveMatchStake(token, payload);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.reserved, 100);
  assert.equal(second.reserved, 100);
  assert.equal(matchStakes.length, 2);
  assert.equal(ledgerEntries.length, ledgerAfterFirst.length);
  assert.deepEqual(ledgerEntries, ledgerAfterFirst);
  assert.equal(wallets.get("player-a")?.balance, 150);
  assert.equal(wallets.get("player-b")?.balance, 150);
  assert.equal(wallets.get("player-a")?.reserved, 50);
  assert.equal(wallets.get("player-b")?.reserved, 50);
});

test("online stake settle is idempotent for the same match", async () => {
  const { service, wallets, ledgerEntries, matchStakes } = makeEconomyHarness();
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

  await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-idem-settle",
      matchId: "match-idem-settle",
      stakeKey: "stake_50",
      participants: [
        { playerId: "player-a", userId: "user-a", displayName: "Alpha" },
        { playerId: "player-b", userId: "user-b", displayName: "Beta" }
      ]
    }, "economy.reserve")
  });

  const first = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-idem-settle",
      matchId: "match-idem-settle",
      stakeKey: "stake_50",
      result: "win",
      winnerPlayerIds: ["player-a"],
      winnerUserIds: ["user-a"]
    }, "economy.settle")
  });
  const afterFirst = ledgerEntries.map((entry) => ({ ...entry }));
  const second = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-idem-settle",
      matchId: "match-idem-settle",
      stakeKey: "stake_50",
      result: "win",
      winnerPlayerIds: ["player-a"],
      winnerUserIds: ["user-a"]
    }, "economy.settle")
  });

  assert.equal(first.ok, true);
  assert.equal(first.settled, 2);
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.equal(ledgerEntries.length, 5);
  assert.equal(ledgerEntries.length, afterFirst.length);
  assert.deepEqual(ledgerEntries, afterFirst);
  assert.equal(wallets.get("player-a")?.balance, 245);
  assert.equal(wallets.get("player-a")?.reserved, 0);
  assert.equal(wallets.get("player-b")?.balance, 150);
  assert.equal(wallets.get("player-b")?.reserved, 0);
  assert.equal(matchStakes.filter((row: any) => row.status === "settled").length, 2);
});

test("forfeit-settle replay does not pay the bank twice", async () => {
  const { service, wallets, ledgerEntries } = makeEconomyHarness();
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

  await service.reserveMatchStake(token, {
    ...withProof({
      roomId: "room-forfeit",
      matchId: "match-forfeit",
      stakeKey: "stake_50",
      participants: [
        { playerId: "player-a", userId: "user-a", displayName: "Alpha" },
        { playerId: "player-b", userId: "user-b", displayName: "Beta" }
      ]
    }, "economy.reserve")
  });

  const first = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-forfeit",
      matchId: "match-forfeit",
      stakeKey: "stake_50",
      result: "loss",
      winnerPlayerIds: ["player-b"],
      winnerUserIds: ["user-b"]
    }, "economy.settle")
  });
  const ledgerAfterFirst = ledgerEntries.map((entry) => ({ ...entry }));
  const second = await service.settleMatchStake(token, {
    ...withProof({
      roomId: "room-forfeit",
      matchId: "match-forfeit",
      stakeKey: "stake_50",
      result: "loss",
      winnerPlayerIds: ["player-b"],
      winnerUserIds: ["user-b"]
    }, "economy.settle")
  });

  assert.equal(first.ok, true);
  assert.equal(first.winners, 1);
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.deepEqual(ledgerEntries, ledgerAfterFirst);
  assert.equal(wallets.get("player-a")?.balance, 150);
  assert.equal(wallets.get("player-a")?.reserved, 0);
  assert.equal(wallets.get("player-b")?.balance, 245);
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
