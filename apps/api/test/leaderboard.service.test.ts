import test from "node:test";
import assert from "node:assert/strict";

const { LeaderboardService } = await import("../src/modules/leaderboard/leaderboard.service.js");

test("LeaderboardService uses db ordering and limit for top players", async () => {
  let captured: any = null;
  const prismaMock = {
    playerStats: {
      findMany: async (query: any) => {
        captured = query;
        return [
          {
            playerId: "p1",
            rating: 1500,
            points: 100,
            wins: 15,
            losses: 1,
            draws: 0,
            matchesPlayed: 16,
            currentStreak: 2,
            bestStreak: 5,
            player: { displayName: "Alpha" }
          },
          {
            playerId: "p2",
            rating: 1400,
            points: 80,
            wins: 12,
            losses: 2,
            draws: 1,
            matchesPlayed: 15,
            currentStreak: 1,
            bestStreak: 4,
            player: { displayName: "Bravo" }
          }
        ];
      }
    }
  } as any;

  const service = new LeaderboardService(prismaMock);
  const items = await service.getTopPlayers(5);

  assert.ok(captured);
  assert.deepEqual(captured.orderBy, [
    { rating: "desc" },
    { matchesPlayed: "desc" },
    { wins: "desc" },
    { losses: "asc" },
    { playerId: "asc" }
  ]);
  assert.equal(captured.take, 5);
  assert.equal(items[0].id, "p1");
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].titleCode, "platinum");
  assert.equal(items[1].id, "p2");
  assert.equal(items[1].rank, 2);
});
