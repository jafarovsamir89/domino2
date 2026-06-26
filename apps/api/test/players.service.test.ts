import test from "node:test";
import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { PlayersService } = await import("../src/modules/players/players.service.js");

test("PlayersService.getById redacts wallet details from public output", async () => {
  const prismaMock = {
    player: {
      findUnique: async () => ({
        id: "player-1",
        displayName: "Alpha",
        avatarSeed: null,
        avatarUrl: null,
        tableSkinKey: null,
        language: "en",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        stats: {
          playerId: "player-1",
          rating: 1200,
          points: 50,
          wins: 1,
          losses: 0,
          draws: 0,
          matchesPlayed: 1,
          currentStreak: 1,
          bestStreak: 1
        },
        modeStats: [
          {
            playerId: "player-1",
            gameMode: "classic101",
            rating: 1111,
            points: 12,
            wins: 2,
            losses: 1,
            draws: 0,
            matchesPlayed: 3,
            currentStreak: 1,
            bestStreak: 2
          }
        ],
        wallet: {
          id: "wallet-1",
          playerId: "player-1",
          balance: 250,
          reserved: 40,
          lifetimeEarned: 250,
          lifetimeSpent: 0
        }
      })
    }
  } as any;

  const service = new PlayersService(prismaMock);
  const result = await service.getById("player-1");

  assert.equal(result?.id, "player-1");
  assert.equal(typeof result?.stats?.titleCode, "string");
  assert.equal(result?.rating, 1200);
  assert.equal(result?.ratings?.telefon?.rating, 1200);
  assert.equal(result?.ratings?.telefon?.titleCode, "silver");
  assert.equal(result?.ratings?.classic101?.rating, 1111);
  assert.equal(result?.ratings?.classic101?.titleCode, "bronze");
  assert.equal(Object.prototype.hasOwnProperty.call(result || {}, "wallet"), false);
});

test("PlayersService.getById fills missing mode ratings with the starting value", async () => {
  const prismaMock = {
    player: {
      findUnique: async () => ({
        id: "player-2",
        displayName: "Bravo",
        avatarSeed: null,
        avatarUrl: null,
        tableSkinKey: null,
        language: "en",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        stats: null,
        modeStats: [],
        wallet: null
      })
    }
  } as any;

  const service = new PlayersService(prismaMock);
  const result = await service.getById("player-2");

  assert.equal(result?.rating, 1000);
  assert.equal(result?.ratings?.telefon?.rating, 1000);
  assert.equal(result?.ratings?.telefon?.titleCode, "rookie");
  assert.equal(result?.ratings?.classic101?.rating, 1000);
  assert.equal(result?.ratings?.classic101?.titleCode, "rookie");
});
