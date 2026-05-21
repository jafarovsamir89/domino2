import test from "node:test";
import assert from "node:assert/strict";

import { createGameToken } from "../src/modules/auth/game-token.js";
import { signDominoPayload } from "../src/modules/security/domino-proof.js";
import { MatchesService } from "../src/modules/matches/matches.service.js";
import { LeaderboardService } from "../src/modules/leaderboard/leaderboard.service.js";

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
    playerStats: {
      create: async ({ data }: any) => {
        const row = {
          playerId: data.playerId,
          rating: 1000,
          points: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          currentStreak: 0,
          bestStreak: 0
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

  return { prismaMock, playersById, statsByPlayerId, wallets, matchesById, participantsByMatchId, auditLogs };
}

test("recordPlatformMatch updates stats, wins, and leaderboard after a successful match record", async () => {
  const { prismaMock, statsByPlayerId, matchesById } = makePrismaHarness();
  const economyStub = {
    settleMatchStake: async () => ({ ok: true, settled: true })
  } as any;
  const service = new MatchesService(prismaMock, economyStub);
  const leaderboard = new LeaderboardService(prismaMock);
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

  const result = await service.recordPlatformMatch(token, withProof({
    sourceMatchId: "room-a:match:001",
    mode: "ffa",
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
  assert.equal(statsByPlayerId.get("player:1")?.matchesPlayed, 1);
  assert.equal(statsByPlayerId.get("player:1")?.wins, 1);
  assert.equal(statsByPlayerId.get("player:2")?.matchesPlayed, 1);
  assert.equal(statsByPlayerId.get("player:2")?.losses, 1);
  assert.ok((statsByPlayerId.get("player:1")?.rating ?? 0) > (statsByPlayerId.get("player:2")?.rating ?? 0));

  const items = await leaderboard.getTopPlayers(10);
  assert.equal(items[0].id, "player:1");
  assert.equal(items[0].rating, statsByPlayerId.get("player:1")?.rating);
});

test("recordPlatformMatch is idempotent for the same sourceMatchId", async () => {
  const { prismaMock, statsByPlayerId, matchesById } = makePrismaHarness();
  const economyStub = {
    settleMatchStake: async () => ({ ok: true, settled: true })
  } as any;
  const service = new MatchesService(prismaMock, economyStub);
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
    sourceMatchId: "room-b:match:001",
    mode: "ffa",
    isTeamMode: false,
    roomId: "room-b",
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
  assert.equal(second.matchId, "room-b:match:001");
  assert.deepEqual(statsByPlayerId.get("player:1"), snapshotAfterFirst.playerA);
  assert.deepEqual(statsByPlayerId.get("player:2"), snapshotAfterFirst.playerB);
});
