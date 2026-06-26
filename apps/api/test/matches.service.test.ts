import test from "node:test";
import assert from "node:assert/strict";

import { createGameToken } from "../src/modules/auth/game-token.js";
import { signDominoPayload } from "../src/modules/security/domino-proof.js";
import { MatchesService } from "../src/modules/matches/matches.service.js";

type PlayerRow = {
  id: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  stats?: any;
};

function withProof(payload: Record<string, unknown>, scope: string) {
  const body = { ...payload, integrityScope: scope };
  return {
    ...body,
    proof: signDominoPayload(body)
  };
}

function makePrismaHarness() {
  const playersByUserId = new Map<string, PlayerRow>();
  const playersById = new Map<string, PlayerRow>();
  const statsByPlayerId = new Map<string, any>();
  const modeStatsByKey = new Map<string, any>();
  const wallets = new Map<string, any>();
  const ledgerKeys = new Set<string>();
  const matchesById = new Map<string, any>();
  const participantsByMatchId = new Map<string, any[]>();
  const auditLogs: any[] = [];

  const prismaMock: any = {
    coinLedgerEntry: {
      findUnique: async ({ where }: any) => (ledgerKeys.has(where.idempotencyKey) ? { id: where.idempotencyKey } : null),
      create: async ({ data }: any) => {
        ledgerKeys.add(data.idempotencyKey);
        return data;
      }
    },
    coinWallet: {
      upsert: async ({ where }: any) => {
        let wallet = wallets.get(where.playerId);
        if (!wallet) {
          wallet = {
            playerId: where.playerId,
            balance: 0,
            reserved: 0,
            lifetimeEarned: 0,
            lifetimeSpent: 0
          };
          wallets.set(where.playerId, wallet);
        }
        return wallet;
      },
      update: async ({ where, data }: any) => {
        const wallet = wallets.get(where.playerId);
        Object.assign(wallet, data);
        return wallet;
      }
    },
    player: {
      upsert: async ({ where, update, create, include }: any) => {
        let player = playersByUserId.get(where.userId);
        if (!player) {
          player = {
            id: `player:${playersByUserId.size + 1}`,
            userId: where.userId,
            displayName: create.displayName,
            isGuest: create.isGuest ?? false
          };
          playersByUserId.set(where.userId, player);
          playersById.set(player.id, player);
        } else {
          Object.assign(player, update);
        }
        if (include?.stats) {
          player.stats = statsByPlayerId.get(player.id) || null;
        }
        return player;
      }
    },
    playerModeStats: {
      findUnique: async ({ where }: any) => {
        const key = `${where.playerId_gameMode.playerId}:${where.playerId_gameMode.gameMode}`;
        return modeStatsByKey.get(key) || null;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.playerId_gameMode.playerId}:${where.playerId_gameMode.gameMode}`;
        let row = modeStatsByKey.get(key);
        if (!row) {
          row = {
            id: `mode:${modeStatsByKey.size + 1}`,
            playerId: where.playerId_gameMode.playerId,
            gameMode: where.playerId_gameMode.gameMode,
            rating: create.rating ?? 1000,
            points: create.points ?? 0,
            wins: create.wins ?? 0,
            losses: create.losses ?? 0,
            draws: create.draws ?? 0,
            matchesPlayed: create.matchesPlayed ?? 0,
            currentStreak: create.currentStreak ?? 0,
            bestStreak: create.bestStreak ?? 0
          };
          modeStatsByKey.set(key, row);
        } else {
          Object.assign(row, update || {});
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const key = `${where.playerId_gameMode.playerId}:${where.playerId_gameMode.gameMode}`;
        const row = modeStatsByKey.get(key);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: any) => {
        const key = `${data.playerId}:${data.gameMode}`;
        const row = {
          id: `mode:${modeStatsByKey.size + 1}`,
          playerId: data.playerId,
          gameMode: data.gameMode,
          rating: data.rating ?? 1000,
          points: data.points ?? 0,
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          draws: data.draws ?? 0,
          matchesPlayed: data.matchesPlayed ?? 0,
          currentStreak: data.currentStreak ?? 0,
          bestStreak: data.bestStreak ?? 0
        };
        modeStatsByKey.set(key, row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        const rows = Array.from(modeStatsByKey.values()).map((row) => ({
          ...row,
          player: playersById.get(row.playerId)
        }));
        const gameMode = where?.gameMode ? String(where.gameMode) : "";
        const filtered = gameMode ? rows.filter((row) => row.gameMode === gameMode) : rows;
        const clauses = Array.isArray(orderBy) ? orderBy : [];
        filtered.sort((a, b) => {
          for (const clause of clauses) {
            const [field, direction] = Object.entries(clause)[0] as [string, string];
            const av = a[field];
            const bv = b[field];
            if (av === bv) continue;
            if (direction === "asc") return av < bv ? -1 : 1;
            return av > bv ? -1 : 1;
          }
          return 0;
        });
        return filtered.slice(0, take ?? filtered.length);
      }
    },
    playerStats: {
      upsert: async ({ where, update, create }: any) => {
        const existing = statsByPlayerId.get(where.playerId);
        if (!existing) {
          const row = {
            playerId: create.playerId,
            rating: create.rating ?? 1000,
            points: create.points ?? 0,
            wins: create.wins ?? 0,
            losses: create.losses ?? 0,
            draws: create.draws ?? 0,
            matchesPlayed: create.matchesPlayed ?? 0,
            currentStreak: create.currentStreak ?? 0,
            bestStreak: create.bestStreak ?? 0
          };
          statsByPlayerId.set(create.playerId, row);
          return row;
        }
        Object.assign(existing, update || {});
        return existing;
      },
      create: async ({ data }: any) => {
        const row = {
          playerId: data.playerId,
          rating: data.rating ?? 1000,
          points: data.points ?? 0,
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          draws: data.draws ?? 0,
          matchesPlayed: data.matchesPlayed ?? 0,
          currentStreak: data.currentStreak ?? 0,
          bestStreak: data.bestStreak ?? 0
        };
        statsByPlayerId.set(data.playerId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = statsByPlayerId.get(where.playerId);
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ orderBy, take }: any) => {
        const rows = Array.from(statsByPlayerId.values()).map((row) => ({
          ...row,
          player: playersById.get(row.playerId)
        }));
        const clauses = Array.isArray(orderBy) ? orderBy : [];
        rows.sort((a, b) => {
          for (const clause of clauses) {
            const [field, direction] = Object.entries(clause)[0] as [string, string];
            const av = a[field];
            const bv = b[field];
            if (av === bv) continue;
            if (direction === "asc") return av < bv ? -1 : 1;
            return av > bv ? -1 : 1;
          }
          return 0;
        });
        return rows.slice(0, take ?? rows.length);
      }
    },
    match: {
      findUnique: async ({ where, include }: any) => {
        const row = matchesById.get(where.id) || null;
        if (!row) return null;
        if (include?.participants) {
          return {
            ...row,
            participants: [...(participantsByMatchId.get(row.id) || [])]
          };
        }
        return row;
      },
      create: async ({ data, include }: any) => {
        const row = {
          id: data.id,
          mode: data.mode,
          gameMode: data.gameMode,
          isTeamMode: data.isTeamMode,
          roomId: data.roomId,
          winnerKey: data.winnerKey,
          result: data.result,
          totalPoints: data.totalPoints,
          createdAt: new Date("2026-05-21T00:00:00Z")
        };
        const participants = (data.participants?.create || []).map((entry: any, index: number) => ({
          id: `mp:${index + 1}`,
          matchId: row.id,
          ...entry
        }));
        matchesById.set(row.id, row);
        participantsByMatchId.set(row.id, participants);
        if (include?.participants) {
          return {
            ...row,
            participants
          };
        }
        return row;
      }
    },
    systemAuditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async (fn: any) => fn(prismaMock)
  };

  return { prismaMock, playersById, statsByPlayerId, modeStatsByKey, wallets, matchesById, participantsByMatchId, auditLogs };
}

function makeService() {
  const { prismaMock, ...rest } = makePrismaHarness();
  const economyStub = {
    settleMatchStake: async (_token: string, payload: any) => ({
      ok: true,
      settled: true,
      result: payload.result,
      winnerUserIds: payload.winnerUserIds
    })
  } as any;
  const service = new MatchesService(prismaMock, economyStub);
  return { service, prismaMock, economyStub, ...rest };
}

function makeToken(userId = "user-a", playerId = "player-a", displayName = "Alpha") {
  return createGameToken({
    userId,
    playerId,
    displayName,
    role: "player",
    sessionId: `session-${userId}`,
    provider: "better-auth",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });
}

test("1v1 human vs human updates ELO, wins, losses, and matchesPlayed", async () => {
  const { service, statsByPlayerId, matchesById, modeStatsByKey } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-a:match:001",
    mode: "ffa",
    gameMode: "telefon",
    isTeamMode: false,
    roomId: "room-a",
    winnerKey: "player:0",
    result: "win",
    stakeKey: "stake_200",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", winnerKey: "player:0", points: 24, roundWins: 2, result: "win" },
      { playerId: "player-b", userId: "user-b", name: "Beta", winnerKey: "player:1", points: 8, roundWins: 0, result: "loss" }
    ],
    totalPoints: 32
  }, "platform.match"));

  assert.ok(result);
  assert.equal(result.matchId, "room-a:match:001");
  assert.equal(matchesById.size, 1);
  assert.equal(matchesById.get("room-a:match:001")?.gameMode, "telefon");
  assert.equal(statsByPlayerId.get("player:1")?.matchesPlayed, 1);
  assert.equal(statsByPlayerId.get("player:1")?.wins, 1);
  assert.equal(statsByPlayerId.get("player:1")?.rating, 1020);
  assert.equal(statsByPlayerId.get("player:2")?.matchesPlayed, 1);
  assert.equal(statsByPlayerId.get("player:2")?.losses, 1);
  assert.equal(statsByPlayerId.get("player:2")?.rating, 980);
  assert.equal(modeStatsByKey.get("player:1:telefon")?.rating, 1020);
  assert.equal(modeStatsByKey.get("player:2:telefon")?.rating, 980);
});

test("human vs bot stays unranked and does not create player stats", async () => {
  const { service, statsByPlayerId, matchesById, modeStatsByKey } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-b:match:001",
    mode: "ffa",
    isTeamMode: false,
    roomId: "room-b",
    winnerKey: "player:0",
    result: "win",
    stakeKey: "free",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", winnerKey: "player:0", points: 10, roundWins: 1, result: "win" }
    ],
    totalPoints: 10
  }, "platform.match"));

  assert.ok(result);
  assert.equal(matchesById.size, 1);
  assert.equal(statsByPlayerId.size, 0);
  assert.equal(modeStatsByKey.size, 0);
});

test("classic101 matches update mode stats only and keep legacy telefon stats untouched", async () => {
  const { service, statsByPlayerId, modeStatsByKey } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-b:match:101",
    mode: "ffa",
    gameMode: "classic101",
    isTeamMode: false,
    roomId: "room-b",
    winnerKey: "player:0",
    result: "win",
    stakeKey: "stake_200",
    classic101DryWin: true,
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", winnerKey: "player:0", points: 101, roundWins: 2, result: "win" },
      { playerId: "player-b", userId: "user-b", name: "Beta", winnerKey: "player:1", points: 0, roundWins: 0, result: "loss" }
    ],
    totalPoints: 101
  }, "platform.match"));

  assert.ok(result);
  assert.equal(statsByPlayerId.size, 0);
  assert.equal(modeStatsByKey.get("player:1:classic101")?.matchesPlayed, 1);
  assert.equal(modeStatsByKey.get("player:1:classic101")?.wins, 1);
  assert.equal(modeStatsByKey.get("player:1:classic101")?.currentStreak, 1);
  assert.equal(modeStatsByKey.get("player:2:classic101")?.losses, 1);
  assert.equal(modeStatsByKey.get("player:2:classic101")?.matchesPlayed, 1);
  assert.equal(modeStatsByKey.get("player:2:classic101")?.currentStreak, 0);
  assert.equal(modeStatsByKey.get("player:1:classic101")?.rating, 1039);
  assert.equal(modeStatsByKey.get("player:2:classic101")?.rating, 961);
  assert.equal(modeStatsByKey.get("player:1:classic101")?.gameMode, "classic101");
});

test("team mode ranks humans while ignoring bots", async () => {
  const { service, statsByPlayerId } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-c:match:001",
    mode: "team",
    gameMode: "telefon",
    isTeamMode: true,
    roomId: "room-c",
    winnerKey: "team:0",
    result: "win",
    stakeKey: "stake_500",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", teamIndex: 0, winnerKey: "team:0", points: 30, roundWins: 2, result: "win" },
      { playerId: "player-b", userId: "user-b", name: "Bravo", teamIndex: 1, winnerKey: "team:1", points: 15, roundWins: 0, result: "loss" },
      { playerId: "player-c", userId: "user-c", name: "Charlie", teamIndex: 0, winnerKey: "team:0", points: 30, roundWins: 2, result: "win" }
    ],
    teams: [
      { memberIds: ["user-a", "user-c"] },
      { memberIds: ["user-b"] }
    ],
    totalPoints: 75
  }, "platform.match"));

  assert.ok(result);
  assert.equal(statsByPlayerId.get("player:1")?.rating, 1020);
  assert.equal(statsByPlayerId.get("player:2")?.rating, 980);
  assert.equal(statsByPlayerId.get("player:3")?.rating, 1020);
});

test("duplicate sourceMatchId does not update ELO twice", async () => {
  const { service, statsByPlayerId, matchesById } = makeService();
  const token = makeToken();

  const payload = withProof({
    sourceMatchId: "room-d:match:001",
    mode: "ffa",
    gameMode: "telefon",
    isTeamMode: false,
    roomId: "room-d",
    winnerKey: "player:0",
    result: "win",
    stakeKey: "stake_200",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", winnerKey: "player:0", points: 24, roundWins: 2, result: "win" },
      { playerId: "player-b", userId: "user-b", name: "Beta", winnerKey: "player:1", points: 8, roundWins: 0, result: "loss" }
    ],
    totalPoints: 32
  }, "platform.match");

  const first = await service.recordPlatformMatch(token, payload);
  const snapshotAfterFirst = {
    playerA: { ...statsByPlayerId.get("player:1") },
    playerB: { ...statsByPlayerId.get("player:2") }
  };
  const second = await service.recordPlatformMatch(token, payload);

  assert.ok(first);
  assert.ok(second);
  assert.equal(matchesById.size, 1);
  assert.equal(second.matchId, "room-d:match:001");
  assert.deepEqual(statsByPlayerId.get("player:1"), snapshotAfterFirst.playerA);
  assert.deepEqual(statsByPlayerId.get("player:2"), snapshotAfterFirst.playerB);
});

test("forfeit 1v1 applies an extra penalty to the leaving player", async () => {
  const { service, statsByPlayerId } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-e:match:001",
    mode: "ffa",
    gameMode: "telefon",
    isTeamMode: false,
    roomId: "room-e",
    winnerKey: "player:1",
    result: "win",
    matchOutcome: "forfeit",
    forfeitUserIds: ["user-a"],
    stakeKey: "stake_200",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", winnerKey: "player:0", points: 12, roundWins: 0, result: "loss" },
      { playerId: "player-b", userId: "user-b", name: "Beta", winnerKey: "player:1", points: 18, roundWins: 2, result: "win" }
    ],
    totalPoints: 30
  }, "platform.match"));

  assert.ok(result);
  assert.equal(statsByPlayerId.get("player:1")?.rating, 975);
  assert.equal(statsByPlayerId.get("player:1")?.losses, 1);
  assert.equal(statsByPlayerId.get("player:2")?.rating, 1020);
  assert.equal(statsByPlayerId.get("player:2")?.wins, 1);
});

test("forfeit team applies the penalty only to the leaving player", async () => {
  const { service, statsByPlayerId } = makeService();
  const token = makeToken();

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-f:match:001",
    mode: "team",
    gameMode: "telefon",
    isTeamMode: true,
    roomId: "room-f",
    winnerKey: "team:1",
    result: "win",
    matchOutcome: "forfeit",
    forfeitUserIds: ["user-a"],
    stakeKey: "stake_500",
    participants: [
      { playerId: "player-a", userId: "user-a", name: "Alpha", teamIndex: 0, winnerKey: "team:0", points: 10, roundWins: 0, result: "loss" },
      { playerId: "player-b", userId: "user-b", name: "Bravo", teamIndex: 0, winnerKey: "team:0", points: 10, roundWins: 0, result: "loss" },
      { playerId: "player-c", userId: "user-c", name: "Charlie", teamIndex: 1, winnerKey: "team:1", points: 20, roundWins: 2, result: "win" },
      { playerId: "player-d", userId: "user-d", name: "Delta", teamIndex: 1, winnerKey: "team:1", points: 20, roundWins: 2, result: "win" }
    ],
    teams: [
      { memberIds: ["user-a", "user-b"] },
      { memberIds: ["user-c", "user-d"] }
    ],
    totalPoints: 60
  }, "platform.match"));

  assert.ok(result);
  assert.equal(statsByPlayerId.get("player:1")?.rating, 975);
  assert.equal(statsByPlayerId.get("player:2")?.rating, 980);
  assert.equal(statsByPlayerId.get("player:3")?.rating, 1020);
  assert.equal(statsByPlayerId.get("player:4")?.rating, 1020);
});
